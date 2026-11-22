// Android APK release & update checker (Phase 6).
//
// 1. Fetches `latest.json` and its detached Ed25519 signature `latest.json.sig`.
// 2. Verifies the Ed25519 signature via WebCrypto against the pinned manifest public key BEFORE acting on any field.
// 3. Compares numeric `version_code > installed.versionCode` and checks `installed.sdkInt >= min_sdk`.
// 4. Distinguishes optional vs. mandatory updates, supports deferring optional updates, and enforces fail-safe rules:
//    - An unsigned, tampered, unreachable, or unpublished manifest never shows a broken update prompt.
//    - If a mandatory update download or verification fails, the student can dismiss the block or open the website
//      so studying is never permanently locked out.

import { isNativePlatform } from "./index.js";

const CHECK_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 hours
const DEFERRED_KEY = "kabisado_deferred_update_version";
const GITHUB_APK_URL_RE = /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/[^/]+\.apk$/;
const HEX64_RE = /^[0-9a-f]{64}$/i;
const HEX128_RE = /^[0-9a-f]{128}$/i;

let lastCheckTimestamp = 0;
let deferredVersionMemory = 0;
let customUpdaterPlugin = null;

export function registerNativeUpdaterPlugin(plugin) {
  customUpdaterPlugin = plugin;
}

function resolveUpdaterPlugin() {
  if (customUpdaterPlugin) return customUpdaterPlugin;
  return globalThis.Capacitor?.Plugins?.KabisadoUpdater || null;
}

export function hexToBytes(hex) {
  const clean = String(hex || "").trim().toLowerCase();
  if (clean.length % 2 !== 0 || !/^[0-9a-f]+$/.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Verify a 128-hex detached Ed25519 signature over rawJsonText against a 64-hex Ed25519 public key.
 * Uses WebCrypto (`crypto.subtle.verify("Ed25519", ...)`). Fails closed (returns false) on any error.
 */
export async function verifyEd25519ManifestSignature(rawJsonText, signatureHex, publicKeyHex) {
  const sigClean = String(signatureHex || "").trim().toLowerCase();
  const pubClean = String(publicKeyHex || "").trim().toLowerCase();
  if (!HEX128_RE.test(sigClean) || !HEX64_RE.test(pubClean)) return false;
  if (typeof globalThis.crypto?.subtle?.importKey !== "function") return false;
  try {
    const pubBytes = hexToBytes(pubClean);
    const sigBytes = hexToBytes(sigClean);
    const msgBytes = new TextEncoder().encode(String(rawJsonText));
    const key = await globalThis.crypto.subtle.importKey(
      "raw",
      pubBytes,
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    return await globalThis.crypto.subtle.verify({ name: "Ed25519" }, key, sigBytes, msgBytes);
  } catch {
    return false;
  }
}

export function getDeferredVersionCode() {
  try {
    const stored = Number(globalThis.localStorage?.getItem(DEFERRED_KEY)) || 0;
    return Math.max(deferredVersionMemory, stored);
  } catch {
    return deferredVersionMemory;
  }
}

export function deferUpdateVersion(versionCode) {
  deferredVersionMemory = Number(versionCode) || 0;
  try {
    globalThis.localStorage?.setItem(DEFERRED_KEY, String(deferredVersionMemory));
  } catch {
    /* ignore storage error */
  }
}

/**
 * Evaluate a verified release manifest against installed Android package info.
 */
export function evaluateReleaseManifest(meta, installed, { ignoreDeferred = false } = {}) {
  if (!meta || typeof meta !== "object" || !installed) {
    return { status: "up_to_date" };
  }
  const latestCode = Number(meta.version_code) || 0;
  const installedCode = Number(installed.versionCode) || 0;
  const minSupported = Number(meta.min_supported_version_code) || 0;
  const minSdk = Number(meta.min_sdk) || 24;
  const deviceSdk = Number(installed.sdkInt) || 24;

  if (
    meta.published !== true ||
    typeof meta.apk_url !== "string" ||
    !GITHUB_APK_URL_RE.test(meta.apk_url) ||
    !HEX64_RE.test(String(meta.sha256 || ""))
  ) {
    return { status: "up_to_date" };
  }

  if (deviceSdk < minSdk) {
    return { status: "incompatible_sdk", minSdk };
  }

  if (latestCode <= installedCode) {
    return { status: "up_to_date" };
  }

  const isMandatory = Boolean(meta.mandatory) || (minSupported > 0 && installedCode < minSupported);
  if (!isMandatory && !ignoreDeferred && getDeferredVersionCode() >= latestCode) {
    return { status: "deferred", release: meta, installed };
  }

  return {
    status: isMandatory ? "mandatory_update" : "optional_update",
    mandatory: isMandatory,
    release: meta,
    installed,
  };
}

/**
 * Check for an available Android APK update.
 *
 * Options:
 * - `force`: bypass the 12-hour check cooldown and deferred version filter (used for manual "Check for updates").
 * - `manifestUrl`: URL to `latest.json` (defaults to `VITE_RELEASE_MANIFEST_URL`).
 * - `publicKeyHex`: 64-hex Ed25519 manifest public key (defaults to `VITE_RELEASE_PUBLIC_KEY`).
 */
export async function checkForAndroidUpdate({
  force = false,
  manifestUrl = import.meta.env?.VITE_RELEASE_MANIFEST_URL || "",
  publicKeyHex = import.meta.env?.VITE_RELEASE_PUBLIC_KEY || "",
} = {}) {
  if (!isNativePlatform()) return { status: "not_native" };
  const plugin = resolveUpdaterPlugin();
  if (!plugin || !manifestUrl || !publicKeyHex) return { status: "unconfigured" };

  const now = Date.now();
  if (!force && lastCheckTimestamp > 0 && now - lastCheckTimestamp < CHECK_COOLDOWN_MS) {
    return { status: "cooldown" };
  }

  try {
    const installed = await plugin.getInstalledInfo();
    const sigUrl = `${manifestUrl}.sig`;
    const [manifestRes, sigRes] = await Promise.all([
      fetch(manifestUrl, { cache: "no-store", credentials: "omit" }),
      fetch(sigUrl, { cache: "no-store", credentials: "omit" }),
    ]);
    if (!manifestRes.ok || !sigRes.ok) {
      return { status: "unavailable" };
    }
    const [rawJsonText, sigHex] = await Promise.all([manifestRes.text(), sigRes.text()]);
    const sigOk = await verifyEd25519ManifestSignature(rawJsonText, sigHex, publicKeyHex);
    if (!sigOk) {
      // Fail-safe rule: an unsigned or tampered manifest shows no update UI at all.
      return { status: "invalid_signature" };
    }
    const meta = JSON.parse(rawJsonText);
    lastCheckTimestamp = now;
    return evaluateReleaseManifest(meta, installed, { ignoreDeferred: force });
  } catch {
    return { status: "unavailable" };
  }
}

export async function downloadAndInstallUpdate(release, { onProgress } = {}) {
  const plugin = resolveUpdaterPlugin();
  if (!plugin) throw new Error("Android updater plugin is not available.");

  let listenerHandle = null;
  if (typeof onProgress === "function" && typeof plugin.addListener === "function") {
    listenerHandle = await Promise.resolve(
      plugin.addListener("downloadProgress", (prog) => {
        onProgress(prog);
      })
    ).catch(() => null);
  }

  try {
    const verified = await plugin.downloadAndVerifyApk({
      apkUrl: release.apk_url,
      expectedSha256: release.sha256,
      expectedSigningCertSha256: release.signing_cert_sha256 || "",
    });
    const installRes = await plugin.installVerifiedApk();
    return { verified, installRes };
  } finally {
    listenerHandle?.remove?.();
  }
}

export async function openAndroidInstallPermissionSettings() {
  const plugin = resolveUpdaterPlugin();
  if (!plugin?.openInstallPermissionSettings) return;
  await plugin.openInstallPermissionSettings();
}

export async function installVerifiedUpdateOnly() {
  const plugin = resolveUpdaterPlugin();
  if (!plugin?.installVerifiedApk) throw new Error("Android updater plugin is not available.");
  return plugin.installVerifiedApk();
}

export function resetUpdaterCooldownForTests() {
  lastCheckTimestamp = 0;
  deferredVersionMemory = 0;
}
