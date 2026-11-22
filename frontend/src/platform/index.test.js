import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NATIVE_CSP,
  getClientHeaders,
  handleHardwareBackButton,
  isNativePlatform,
  registerBackHandler,
  registerNativeSecureStorage,
  secureTokenStorage,
  setNativeClientVersionCode,
  setPlatformOverride,
} from "./index.js";

describe("platform adapters", () => {
  beforeEach(() => {
    setPlatformOverride(null);
    registerNativeSecureStorage(null);
  });

  it("defaults to web platform and returns empty client headers on web", () => {
    setPlatformOverride("web");
    expect(isNativePlatform()).toBe(false);
    expect(getClientHeaders()).toEqual({});
  });

  it("returns X-Kabisado-Client header in native mode", () => {
    setPlatformOverride("native");
    setNativeClientVersionCode(10203);
    expect(isNativePlatform()).toBe(true);
    expect(getClientHeaders()).toEqual({ "X-Kabisado-Client": "android/10203" });
  });

  it.each([
    ["DECRYPTION_ERROR", "javax.crypto.IllegalBlockSizeException"],
    ["ERR", "javax.crypto.AEADBadTagException"],
    ["ERR", "android.security.keystore.KeyPermanentlyInvalidatedException"],
    ["ERR", "java.security.UnrecoverableKeyException"],
  ])("wipes corrupted Keystore entry and returns null on %s (%s)", async (code, message) => {
    setPlatformOverride("native");
    const remove = vi.fn(async () => {});
    registerNativeSecureStorage({
      get: vi.fn(async () => {
        const err = new Error(message);
        err.code = code;
        throw err;
      }),
      set: vi.fn(),
      remove,
    });
    const token = await secureTokenStorage.getRefreshToken();
    expect(token).toBeNull();
    expect(remove).toHaveBeenCalledWith({ key: "kabisado_refresh_token" });
  });

  it("enforces a strict native Content-Security-Policy with no unsafe-inline or unsafe-eval scripts, synced with vite.config.js", () => {
    expect(NATIVE_CSP).toContain("default-src 'self'");
    expect(NATIVE_CSP).toContain("script-src 'self'");
    expect(NATIVE_CSP).toContain("object-src 'none'");
    expect(NATIVE_CSP).toContain("base-uri 'none'");
    expect(NATIVE_CSP).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(NATIVE_CSP).not.toMatch(/script-src[^;]*unsafe-eval/);

    const viteConfigSource = readFileSync(new URL("../../vite.config.js", import.meta.url), "utf8");
    expect(viteConfigSource).toContain(NATIVE_CSP);
  });

  it("delegates hardware back button presses to the registered back handler before exiting", () => {
    let canGoBack = true;
    const off = registerBackHandler(() => {
      if (canGoBack) {
        canGoBack = false;
        return true;
      }
      return false;
    });
    expect(handleHardwareBackButton()).toBe(true);
    expect(handleHardwareBackButton()).toBe(false);
    off();
  });
});
