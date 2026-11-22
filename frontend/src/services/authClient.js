// Authentication client (dual web-cookie and native-Keystore transport).
//
// The access token (15 minutes) lives ONLY in this module's memory: never in localStorage/sessionStorage, so a
// script injected into the page cannot read it from storage.
// - On web: the long-lived refresh token is an HttpOnly cookie that JavaScript cannot see; the browser sends it to
//   /api/auth/refresh on its own.
// - On native (Android Capacitor): the refresh token is returned by /api/auth/native/* and stored exclusively in
//   Android Keystore-backed secure storage via `secureTokenStorage`.

import {
  getClientHeaders,
  isNativePlatform,
  notifyUpgradeRequired,
  secureTokenStorage,
} from "../platform/index.js";

const API_BASE = (import.meta.env?.VITE_API_BASE || "").replace(/\/+$/, "");
const CSRF = { "X-Kabisado-Request": "1" };

let accessToken = null;
let currentUser = null;
let refreshPromise = null;
const listeners = new Set();

function notify(user) {
  currentUser = user;
  listeners.forEach((cb) => {
    try {
      cb(user);
    } catch {
      /* a broken listener must not break auth */
    }
  });
}

function setSession(token, user) {
  accessToken = token;
  notify(user);
}

function clearSession() {
  accessToken = null;
  notify(null);
}

function authPath(webPath) {
  if (!isNativePlatform()) return webPath;
  return webPath.replace(/^\/api\/auth\//, "/api/auth/native/");
}

function checkUpgradeRequired(res, data) {
  if (res.status === 426) {
    notifyUpgradeRequired(
      data && typeof data === "object"
        ? data
        : { detail: "Please update the Kabisado app to continue.", code: "UPGRADE_REQUIRED" }
    );
  }
}

async function persistSessionFromResponse(data) {
  if (isNativePlatform() && data?.refresh_token) {
    // Write the rotated/issued refresh token to Keystore BEFORE activating the new access token in memory.
    await secureTokenStorage.setRefreshToken(data.refresh_token);
  }
  setSession(data.access_token, data.user);
}

async function postJson(path, body) {
  const native = isNativePlatform();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getClientHeaders() },
    credentials: native ? "omit" : "same-origin",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  checkUpgradeRequired(res, data);
  if (!res.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map((d) => d.msg).join(" ") : data.detail;
    const err = new Error(detail || "Something went wrong. Please try again.");
    err.status = res.status;
    err.retryAfter = Number(res.headers.get("Retry-After")) || null;
    throw err;
  }
  return data;
}

/** One refresh round trip. Returns true when we hold a fresh access token. */
async function doRefresh() {
  const native = isNativePlatform();
  let res;
  try {
    if (native) {
      const refreshToken = await secureTokenStorage.getRefreshToken();
      if (!refreshToken) return false;
      res = await fetch(`${API_BASE}/api/auth/native/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getClientHeaders() },
        credentials: "omit",
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } else {
      res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: CSRF,
        credentials: "same-origin",
      });
    }
  } catch {
    return false; // offline or server waking up: stay signed in locally and let the caller retry later
  }
  if (res.status === 426) {
    const data = await res.json().catch(() => ({}));
    checkUpgradeRequired(res, data);
    return false;
  }
  if (res.ok) {
    const data = await res.json();
    await persistSessionFromResponse(data);
    return true;
  }
  if (res.status === 401 || res.status === 403) {
    if (native) await secureTokenStorage.clearRefreshToken();
    clearSession(); // the session is really over
  }
  return false;
}

/** Single-flight: concurrent callers (and, with Web Locks, other tabs) share one refresh. */
function refresh() {
  if (!refreshPromise) {
    const run = () => doRefresh();
    const locked =
      typeof navigator !== "undefined" && navigator.locks?.request
        ? navigator.locks.request("kabisado-refresh", run)
        : run();
    refreshPromise = Promise.resolve(locked).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function withAuth(options, token) {
  const native = isNativePlatform();
  const headers = { ...getClientHeaders(), ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return {
    ...options,
    headers,
    credentials: options.credentials || (native ? "omit" : "same-origin"),
  };
}

/** fetch() plus the bearer token; on a 401 refresh once and retry once. */
async function authFetch(url, options = {}) {
  const res = await fetch(url, withAuth(options, accessToken));
  if (res.status === 426) {
    const cloneData = await res.clone().json().catch(() => ({}));
    checkUpgradeRequired(res, cloneData);
    return res;
  }
  if (res.status !== 401) return res;
  const staleToken = accessToken;
  const ok = await refresh();
  if (!ok) return res;
  if (accessToken === staleToken) return res; // nothing new to retry with
  return fetch(url, withAuth(options, accessToken)); // whatever this returns is final: no second refresh
}

const authClient = {
  async register({ displayName, email, password, confirmPassword }) {
    const data = await postJson(authPath("/api/auth/register"), {
      display_name: displayName,
      email,
      password,
      confirm_password: confirmPassword,
    });
    await persistSessionFromResponse(data);
    return { user: data.user };
  },

  async login({ email, password }) {
    const data = await postJson(authPath("/api/auth/login"), { email, password });
    await persistSessionFromResponse(data);
    return data.user;
  },

  async forgotPassword({ email }) {
    return postJson("/api/auth/forgot-password", { email });
  },

  async resetPassword({ email, code, newPassword, confirmPassword }) {
    const data = await postJson(authPath("/api/auth/reset-password"), {
      email,
      code,
      new_password: newPassword,
      confirm_password: confirmPassword,
    });
    await persistSessionFromResponse(data);
    return { user: data.user };
  },

  async recover({ username, recoveryCode, newPassword, confirmPassword }) {
    const data = await postJson(authPath("/api/auth/recover"), {
      username,
      recovery_code: recoveryCode,
      new_password: newPassword,
      confirm_password: confirmPassword,
    });
    await persistSessionFromResponse(data);
    return { user: data.user, recoveryCode: data.recovery_code };
  },

  async logout() {
    if (isNativePlatform()) {
      const refreshToken = await secureTokenStorage.getRefreshToken();
      await secureTokenStorage.clearRefreshToken();
      if (refreshToken) {
        try {
          await fetch(`${API_BASE}/api/auth/native/logout`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getClientHeaders() },
            credentials: "omit",
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
        } catch {
          /* offline: local Keystore token is already wiped; server session expires on its own */
        }
      }
    } else {
      try {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: "POST",
          headers: CSRF,
          credentials: "same-origin",
        });
      } catch {
        /* offline: we still sign out locally; the server session expires on its own */
      }
    }
    clearSession();
  },

  /** Called once when the app opens: turns the refresh cookie (or native Keystore token) into an access token. */
  async restoreSession() {
    return (await refresh()) ? currentUser : null;
  },

  getAccessToken: () => accessToken,

  onAuthChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },

  authFetch,
};

export default authClient;
export { authFetch };
