// Platform capability adapters for Web vs. Native (Android Capacitor).
//
// Web implementations wrap standard browser APIs so the web app behaves identically to today.
// Native overrides are registered at app boot in the Android Capacitor build (Phase 4) or injected in tests.
// Refresh tokens on native MUST use Android Keystore-backed secure storage — never localStorage/sessionStorage.

const REFRESH_KEY = "kabisado_refresh_token";
const KEYSTORE_ERROR_RE =
  /DECRYPT|KEYSTORE|IllegalBlockSize|BadPadding|AEADBadTag|InvalidKey|KeyPermanentlyInvalidated|UnrecoverableKey/i;

export const NATIVE_CSP =
  "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'self' https:; img-src 'self' data:; style-src 'self' 'unsafe-inline'";

let platformOverride = null; // null | "web" | "native"
let nativeClientVersionCode = Number(import.meta.env?.VITE_ANDROID_VERSION_CODE) || 10000;
let customSecureStorage = null;
let customFileSaver = null;
let customSpeechAdapter = null;
let backHandler = null;
const upgradeListeners = new Set();

export function isNativePlatform() {
  if (platformOverride !== null) return platformOverride === "native";
  if (import.meta.env?.VITE_PLATFORM === "native") return true;
  return Boolean(globalThis.Capacitor?.isNativePlatform?.());
}

/** Test / boot hook to explicitly force platform mode ("web" | "native" | null). */
export function setPlatformOverride(mode) {
  platformOverride = mode;
}

export function setNativeClientVersionCode(versionCode) {
  nativeClientVersionCode = Number(versionCode) || 10000;
}

export function getClientHeaders() {
  if (!isNativePlatform()) return {};
  return { "X-Kabisado-Client": `android/${nativeClientVersionCode}` };
}

// ==================== 426 Upgrade Required Pub/Sub ====================
export function onUpgradeRequired(cb) {
  upgradeListeners.add(cb);
  return () => upgradeListeners.delete(cb);
}

export function notifyUpgradeRequired(payload) {
  upgradeListeners.forEach((cb) => {
    try {
      cb(payload);
    } catch {
      /* listener error must not break caller */
    }
  });
}

// ==================== Keystore-Backed Refresh Token Storage ====================
function resolveNativeStoragePlugin() {
  if (customSecureStorage) return customSecureStorage;
  return (
    globalThis.Capacitor?.Plugins?.KabisadoKeystore ||
    globalThis.Capacitor?.Plugins?.SecureStoragePlugin ||
    null
  );
}

export function registerNativeSecureStorage(adapter) {
  customSecureStorage = adapter;
}

export const secureTokenStorage = {
  async getRefreshToken() {
    if (!isNativePlatform()) return null;
    const plugin = resolveNativeStoragePlugin();
    if (!plugin) return null;
    try {
      const res = await plugin.get({ key: REFRESH_KEY });
      const val = typeof res === "string" ? res : res?.value;
      return val && typeof val === "string" ? val : null;
    } catch (err) {
      // If Keystore decryption failed (e.g. reinstall/OS restore without Keystore key), wipe corrupted entry.
      const code = `${err?.code || ""} ${err?.message || ""}`;
      if (KEYSTORE_ERROR_RE.test(code)) {
        try {
          await plugin.remove({ key: REFRESH_KEY });
        } catch {
          /* ignore cleanup failure */
        }
      }
      return null;
    }
  },

  async setRefreshToken(token) {
    if (!isNativePlatform()) return;
    const plugin = resolveNativeStoragePlugin();
    if (!plugin) throw new Error("Native secure storage plugin is not available.");
    await plugin.set({ key: REFRESH_KEY, value: String(token) });
  },

  async clearRefreshToken() {
    if (!isNativePlatform()) return;
    const plugin = resolveNativeStoragePlugin();
    if (!plugin) return;
    try {
      await plugin.remove({ key: REFRESH_KEY });
    } catch {
      /* already absent */
    }
  },
};

// ==================== File Export Adapter ====================
export function registerNativeFileSaver(fn) {
  customFileSaver = fn;
}

export async function saveJsonDownload(blob, filename = "kabisado-my-data.json") {
  if (isNativePlatform() && customFileSaver) {
    return customFileSaver(blob, filename);
  }
  const fsPlugin = globalThis.Capacitor?.Plugins?.Filesystem;
  const sharePlugin = globalThis.Capacitor?.Plugins?.Share;
  if (isNativePlatform() && fsPlugin && sharePlugin) {
    const text = await blob.text();
    const written = await fsPlugin.writeFile({
      path: filename,
      data: text,
      directory: "CACHE",
      encoding: "utf8",
    });
    await sharePlugin.share({
      title: filename,
      url: written.uri,
      dialogTitle: "Save or share your Kabisado data",
    });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ==================== Network & Back Navigation Adapters ====================
export function isOnline() {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") return true;
  return navigator.onLine;
}

export function onNetworkChange(cb) {
  if (typeof window === "undefined") return () => {};
  const onOnline = () => cb(true);
  const onOffline = () => cb(false);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  let disposed = false;
  let capHandle = null;
  const netPlugin = globalThis.Capacitor?.Plugins?.Network;
  if (isNativePlatform() && netPlugin?.addListener) {
    Promise.resolve(
      netPlugin.addListener("networkStatusChange", (status) => {
        if (!disposed) cb(Boolean(status?.connected));
      })
    )
      .then((h) => {
        if (disposed) {
          h?.remove?.();
        } else {
          capHandle = h;
        }
      })
      .catch(() => {});
  }

  return () => {
    disposed = true;
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    capHandle?.remove?.();
    capHandle = null;
  };
}

/**
 * Register a handler for the Android hardware Back button.
 * The handler should return `true` if it consumed the back press (e.g. closed a modal or navigated back),
 * or `false` if the app is at the root view and should exit.
 */
export function registerBackHandler(fn) {
  backHandler = fn;
  return () => {
    if (backHandler === fn) backHandler = null;
  };
}

export function handleHardwareBackButton() {
  if (typeof backHandler === "function") {
    const consumed = Boolean(backHandler());
    if (consumed) return true;
  }
  globalThis.Capacitor?.Plugins?.App?.exitApp?.();
  return false;
}

// ==================== Speech (TTS & STT) Adapters ====================
export function registerNativeSpeechAdapter(adapter) {
  customSpeechAdapter = adapter;
}

function resolveNativeTtsPlugin() {
  if (customSpeechAdapter) return customSpeechAdapter;
  return globalThis.Capacitor?.Plugins?.KabisadoSpeech || null;
}

export const speech = {
  isTtsSupported() {
    if (isNativePlatform() && resolveNativeTtsPlugin()) return true;
    return typeof window !== "undefined" && Boolean(window.speechSynthesis);
  },

  isRecognitionSupported() {
    if (typeof window === "undefined") return false;
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  },

  speakText(text, options = {}) {
    const nativeTts = isNativePlatform() ? resolveNativeTtsPlugin() : null;
    if (nativeTts?.speakText || nativeTts?.speak) {
      const fn = nativeTts.speakText || nativeTts.speak;
      Promise.resolve(fn.call(nativeTts, { text, rate: options.rate || 1.0 }))
        .then(() => options.onEnd?.())
        .catch(() => options.onError?.());
      return true;
    }
    if (typeof window === "undefined" || !window.speechSynthesis) return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (options.rate) utterance.rate = options.rate;
    if (options.pitch) utterance.pitch = options.pitch;
    if (options.onEnd) utterance.onend = options.onEnd;
    if (options.onError) utterance.onerror = options.onError;
    window.speechSynthesis.speak(utterance);
    return true;
  },

  cancelSpeech() {
    const nativeTts = isNativePlatform() ? resolveNativeTtsPlugin() : null;
    if (nativeTts?.cancelSpeech || nativeTts?.stop) {
      const fn = nativeTts.cancelSpeech || nativeTts.stop;
      Promise.resolve(fn.call(nativeTts)).catch(() => {});
      return;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  },
};

/** Initialize Capacitor native listeners (versionCode + hardware Back button) once on startup. */
export function initNativeBridge() {
  if (!isNativePlatform()) return;
  const appPlugin = globalThis.Capacitor?.Plugins?.App;
  if (appPlugin?.getInfo) {
    Promise.resolve(appPlugin.getInfo())
      .then((info) => {
        if (info?.build) setNativeClientVersionCode(Number(info.build));
      })
      .catch(() => {});
  }
  if (appPlugin?.addListener) {
    appPlugin.addListener("backButton", () => {
      handleHardwareBackButton();
    });
  }
}
