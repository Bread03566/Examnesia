import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkForAndroidUpdate,
  deferUpdateVersion,
  downloadAndInstallUpdate,
  evaluateReleaseManifest,
  hexToBytes,
   registerNativeUpdaterPlugin,
  resetUpdaterCooldownForTests,
  verifyEd25519ManifestSignature,
} from "./updater.js";
import { setPlatformOverride } from "./index.js";

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function generateEd25519TestKeypairAndSign(rawJsonText) {
  const kp = await globalThis.crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const pubRaw = await globalThis.crypto.subtle.exportKey("raw", kp.publicKey);
  const sigRaw = await globalThis.crypto.subtle.sign(
    { name: "Ed25519" },
    kp.privateKey,
    new TextEncoder().encode(rawJsonText)
  );
  return {
    publicKeyHex: bytesToHex(pubRaw),
    signatureHex: bytesToHex(sigRaw),
  };
}

const VALID_MANIFEST = {
  version_name: "1.1.0",
  version_code: 10100,
  min_supported_version_code: 10000,
  min_sdk: 24,
  published: true,
  apk_url: "https://github.com/owner/Kabisado-project/releases/download/v1.1.0/kabisado-1.1.0-10100.apk",
  sha256: "a".repeat(64),
  signing_cert_sha256: "b".repeat(64),
  file_size_bytes: 5242880,
  release_date: "2026-11-22",
  mandatory: false,
  release_notes: ["Faster flashcards and Android updater."],
};

describe("Android APK release & Ed25519 update checker (Phase 6)", () => {
  beforeEach(() => {
    setPlatformOverride(null);
    registerNativeUpdaterPlugin(null);
    resetUpdaterCooldownForTests();
    vi.restoreAllMocks();
  });

  it("verifies valid Ed25519 manifest signatures and rejects any tampered manifest bytes", async () => {
    const rawJson = JSON.stringify(VALID_MANIFEST, null, 2);
    const { publicKeyHex, signatureHex } = await generateEd25519TestKeypairAndSign(rawJson);

    expect(hexToBytes(publicKeyHex)).toHaveLength(32);
    expect(await verifyEd25519ManifestSignature(rawJson, signatureHex, publicKeyHex)).toBe(true);

    // Tampering with mandatory flag, version_code, or apk_url must fail verification
    const tamperedJson = JSON.stringify({ ...VALID_MANIFEST, mandatory: true }, null, 2);
    expect(await verifyEd25519ManifestSignature(tamperedJson, signatureHex, publicKeyHex)).toBe(false);
    expect(await verifyEd25519ManifestSignature(rawJson, "0".repeat(128), publicKeyHex)).toBe(false);
  });

  it("evaluates optional, deferred, mandatory, and incompatible-SDK releases accurately", () => {
    const installed = { versionCode: 10000, versionName: "1.0.0", sdkInt: 33 };

    // 1. Optional update when latest > installed
    const opt = evaluateReleaseManifest(VALID_MANIFEST, installed);
    expect(opt.status).toBe("optional_update");
    expect(opt.mandatory).toBe(false);

    // 2. Deferring that version suppresses optional prompt unless ignoreDeferred is true
    deferUpdateVersion(10100);
    expect(evaluateReleaseManifest(VALID_MANIFEST, installed).status).toBe("deferred");
    expect(evaluateReleaseManifest(VALID_MANIFEST, installed, { ignoreDeferred: true }).status).toBe("optional_update");

    // 3. Mandatory update (either mandatory: true or installed < min_supported_version_code) ignores deferral
    const minGate = evaluateReleaseManifest({ ...VALID_MANIFEST, min_supported_version_code: 10050 }, installed);
    expect(minGate.status).toBe("mandatory_update");
    expect(minGate.mandatory).toBe(true);

    // 4. Device SDK below min_sdk is never prompted to install an incompatible APK
    const oldDevice = evaluateReleaseManifest({ ...VALID_MANIFEST, min_sdk: 28 }, { ...installed, sdkInt: 24 });
    expect(oldDevice.status).toBe("incompatible_sdk");

    // 5. Unpublished or same/older version is up_to_date
    expect(evaluateReleaseManifest({ ...VALID_MANIFEST, published: false }, installed).status).toBe("up_to_date");
    expect(evaluateReleaseManifest(VALID_MANIFEST, { ...installed, versionCode: 10100 }).status).toBe("up_to_date");
  });

  it("fetches and verifies signed manifest in checkForAndroidUpdate, failing safe on bad signature", async () => {
    setPlatformOverride("native");
    const rawJson = JSON.stringify(VALID_MANIFEST);
    const { publicKeyHex, signatureHex } = await generateEd25519TestKeypairAndSign(rawJson);

    registerNativeUpdaterPlugin({
      getInstalledInfo: vi.fn(async () => ({
        packageName: "com.kabisado.app",
        versionName: "1.0.0",
        versionCode: 10000,
        sdkInt: 34,
        canInstallPackages: true,
        signingCertSha256: "b".repeat(64),
      })),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).endsWith(".sig")) return new Response(signatureHex, { status: 200 });
        return new Response(rawJson, { status: 200 });
      })
    );

    const res = await checkForAndroidUpdate({
      force: true,
      manifestUrl: "https://example.github.io/Kabisado-project/release/latest.json",
      publicKeyHex,
    });
    expect(res.status).toBe("optional_update");
    expect(res.release.version_code).toBe(10100);

    // Fail-safe: wrong public key returns invalid_signature (never prompts user with untrusted manifest)
    const badRes = await checkForAndroidUpdate({
      force: true,
      manifestUrl: "https://example.github.io/Kabisado-project/release/latest.json",
      publicKeyHex: "c".repeat(64),
    });
    expect(badRes.status).toBe("invalid_signature");
  });

  it("streams download progress, verifies SHA-256 & cert via native plugin, and hands off to Android package installer", async () => {
    setPlatformOverride("native");
    const progressEvents = [];
    const plugin = {
      addListener: vi.fn(async (_event, cb) => {
        cb({ percent: 50, bytesRead: 100, totalBytes: 200 });
        cb({ percent: 100, bytesRead: 200, totalBytes: 200 });
        return { remove: vi.fn() };
      }),
      downloadAndVerifyApk: vi.fn(async () => ({
        verified: true,
        sha256: VALID_MANIFEST.sha256,
        versionCode: 10100,
      })),
      installVerifiedApk: vi.fn(async () => ({
        launched: true,
        needsInstallPermission: false,
      })),
    };
    registerNativeUpdaterPlugin(plugin);

    const out = await downloadAndInstallUpdate(VALID_MANIFEST, {
      onProgress: (p) => progressEvents.push(p.percent),
    });
    expect(progressEvents).toEqual([50, 100]);
    expect(plugin.downloadAndVerifyApk).toHaveBeenCalledWith({
      apkUrl: VALID_MANIFEST.apk_url,
      expectedSha256: VALID_MANIFEST.sha256,
      expectedSigningCertSha256: VALID_MANIFEST.signing_cert_sha256,
    });
    expect(out.installRes.launched).toBe(true);
  });
});
