import { beforeEach, describe, expect, it, vi } from "vitest";

const json = (status, body = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const USER = { public_id: "u1", display_name: "Ana", username: "ana@gmail.com", role: "student" };

let storage;
let fetchMock;
let authClient;
let refreshCalls;

function installStorage() {
  const make = () => ({ setItem: vi.fn(), getItem: vi.fn(() => null), removeItem: vi.fn() });
  storage = { local: make(), session: make() };
  vi.stubGlobal("localStorage", storage.local);
  vi.stubGlobal("sessionStorage", storage.session);
}

async function load(handler) {
  refreshCalls = 0;
  fetchMock = vi.fn(async (url, options = {}) => {
    if (String(url).endsWith("/api/auth/refresh")) refreshCalls += 1;
    return handler(String(url), options);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.resetModules();
  authClient = (await import("./authClient.js")).default;
}

async function signIn() {
  await authClient.login({ email: "ana@gmail.com", password: "pw" });
}

beforeEach(() => {
  installStorage();
});

const loginThen = (rest) => (url, options) => {
  if (url.endsWith("/api/auth/login")) return json(200, { access_token: "old", user: USER });
  return rest(url, options);
};

describe("token storage", () => {
  it("keeps the access token in memory only", async () => {
    await load(loginThen(() => json(200)));
    await signIn();
    expect(authClient.getAccessToken()).toBe("old");
    expect(storage.local.setItem).not.toHaveBeenCalled();
    expect(storage.session.setItem).not.toHaveBeenCalled();
  });

  it("sends refresh and logout calls with the CSRF header and same-origin credentials", async () => {
    await load(
      loginThen((url) => {
        if (url.endsWith("/api/auth/refresh")) return json(200, { access_token: "new", user: USER });
        return json(204);
      })
    );
    await authClient.restoreSession();
    await authClient.logout();
    for (const [url, options] of fetchMock.mock.calls) {
      expect(options.method).toBe("POST");
      expect(options.headers["X-Kabisado-Request"]).toBe("1");
      expect(options.credentials).toBe("same-origin");
      expect(url).toMatch(/\/api\/auth\/(refresh|logout)$/);
    }
  });
});

describe("authFetch", () => {
  it("adds the bearer token", async () => {
    await load(loginThen(() => json(200, [])));
    await signIn();
    await authClient.authFetch("/api/documents");
    expect(fetchMock.mock.calls.at(-1)[1].headers.Authorization).toBe("Bearer old");
  });

  it("on 401 refreshes once and retries successfully", async () => {
    await load(
      loginThen((url, options) => {
        if (url.endsWith("/api/auth/refresh")) return json(200, { access_token: "new", user: USER });
        return options.headers.Authorization === "Bearer new" ? json(200, ["ok"]) : json(401);
      })
    );
    await signIn();
    const res = await authClient.authFetch("/api/documents");
    expect(res.status).toBe(200);
    expect(refreshCalls).toBe(1);
    expect(authClient.getAccessToken()).toBe("new");
  });

  it("five concurrent 401s share exactly one refresh call", async () => {
    await load(
      loginThen(async (url, options) => {
        if (url.endsWith("/api/auth/refresh")) {
          await new Promise((r) => setTimeout(r, 20));
          return json(200, { access_token: "new", user: USER });
        }
        return options.headers.Authorization === "Bearer new" ? json(200, []) : json(401);
      })
    );
    await signIn();
    const results = await Promise.all(Array.from({ length: 5 }, () => authClient.authFetch("/api/documents")));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(refreshCalls).toBe(1);
  });

  it("a failed refresh notifies listeners with null, returns the 401 and does not loop", async () => {
    await load(
      loginThen((url) => (url.endsWith("/api/auth/refresh") ? json(401, { detail: "expired" }) : json(401)))
    );
    const seen = [];
    authClient.onAuthChange((u) => seen.push(u));
    await signIn();
    const res = await authClient.authFetch("/api/documents");
    expect(res.status).toBe(401);
    expect(refreshCalls).toBe(1);
    expect(fetchMock.mock.calls.filter(([u]) => u.endsWith("/api/documents"))).toHaveLength(1);
    expect(seen.at(-1)).toBeNull();
    expect(authClient.getAccessToken()).toBeNull();
  });

  it("a retry that is still 401 is returned, not retried again", async () => {
    await load(
      loginThen((url) =>
        url.endsWith("/api/auth/refresh") ? json(200, { access_token: "new", user: USER }) : json(401)
      )
    );
    await signIn();
    const res = await authClient.authFetch("/api/documents");
    expect(res.status).toBe(401);
    expect(refreshCalls).toBe(1);
  });

  it("a network error during refresh does not sign the user out", async () => {
    await load(
      loginThen((url) => {
        if (url.endsWith("/api/auth/refresh")) throw new TypeError("network down");
        return json(401);
      })
    );
    const seen = [];
    authClient.onAuthChange((u) => seen.push(u));
    await signIn();
    const res = await authClient.authFetch("/api/documents");
    expect(res.status).toBe(401);
    expect(seen.filter((u) => u === null)).toHaveLength(0);
    expect(authClient.getAccessToken()).toBe("old");
  });
});

describe("session lifecycle", () => {
  it("restoreSession returns the user from the refresh cookie, or null", async () => {
    await load(() => json(200, { access_token: "t", user: USER }));
    expect(await authClient.restoreSession()).toEqual(USER);
    await load(() => json(401));
    expect(await authClient.restoreSession()).toBeNull();
  });

  it("logout clears the token even when the network fails", async () => {
    await load(
      loginThen((url) => {
        if (url.endsWith("/api/auth/logout")) throw new TypeError("offline");
        return json(200);
      })
    );
    const seen = [];
    authClient.onAuthChange((u) => seen.push(u));
    await signIn();
    await expect(authClient.logout()).resolves.toBeUndefined();
    expect(authClient.getAccessToken()).toBeNull();
    expect(seen.at(-1)).toBeNull();
  });

  it("register, forgotPassword, and resetPassword work with Gmail and sign the user in", async () => {
    await load((url) => {
      if (url.endsWith("/forgot-password")) return json(200, { detail: "Code sent." });
      return json(url.endsWith("/register") ? 201 : 200, { access_token: "t", user: USER });
    });
    const reg = await authClient.register({ displayName: "Ana", email: "ana@gmail.com", password: "p", confirmPassword: "p" });
    expect(reg).toEqual({ user: USER });
    expect(authClient.getAccessToken()).toBe("t");

    const forgot = await authClient.forgotPassword({ email: "ana@gmail.com" });
    expect(forgot.detail).toBe("Code sent.");

    const rec = await authClient.resetPassword({
      email: "ana@gmail.com", code: "123456", newPassword: "p", confirmPassword: "p",
    });
    expect(rec).toEqual({ user: USER });
    const body = JSON.parse(fetchMock.mock.calls.at(-1)[1].body);
    expect(body).toEqual({ email: "ana@gmail.com", code: "123456", new_password: "p", confirm_password: "p" });
  });

  it("login errors carry the server message and status, and leave no token", async () => {
    await load(() => json(429, { detail: "Too many attempts." }));
    await expect(authClient.login({ email: "a@gmail.com", password: "b" })).rejects.toMatchObject({
      message: "Too many attempts.",
      status: 429,
    });
    expect(authClient.getAccessToken()).toBeNull();
  });

  it("onAuthChange returns an unsubscribe function", async () => {
    await load(loginThen(() => json(200)));
    const cb = vi.fn();
    const off = authClient.onAuthChange(cb);
    off();
    await signIn();
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("native (Android Capacitor) auth transport", () => {
  let platform;
  let keystore;

  async function loadNative(handler) {
    refreshCalls = 0;
    fetchMock = vi.fn(async (url, options = {}) => {
      if (String(url).endsWith("/api/auth/native/refresh")) refreshCalls += 1;
      return handler(String(url), options);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    platform = await import("../platform/index.js");
    platform.setPlatformOverride("native");
    platform.setNativeClientVersionCode(10002);

    const store = new Map();
    keystore = {
      store,
      get: vi.fn(async ({ key }) => ({ value: store.get(key) || null })),
      set: vi.fn(async ({ key, value }) => {
        store.set(key, value);
      }),
      remove: vi.fn(async ({ key }) => {
        store.delete(key);
      }),
    };
    platform.registerNativeSecureStorage(keystore);
    authClient = (await import("./authClient.js")).default;
  }

  it("logs in via /api/auth/native/login, stores refresh token in Keystore, and never touches localStorage/sessionStorage", async () => {
    await loadNative((url, options) => {
      expect(url).toBe("/api/auth/native/login");
      expect(options.credentials).toBe("omit");
      expect(options.headers["X-Kabisado-Client"]).toBe("android/10002");
      return json(200, { access_token: "nat-acc-1", refresh_token: "nat-rt-1", user: USER });
    });
    await authClient.login({ email: "ana@gmail.com", password: "pw" });
    expect(authClient.getAccessToken()).toBe("nat-acc-1");
    expect(keystore.store.get("kabisado_refresh_token")).toBe("nat-rt-1");
    expect(storage.local.setItem).not.toHaveBeenCalled();
    expect(storage.session.setItem).not.toHaveBeenCalled();
  });

  it("rotates the refresh token in Keystore on 401 and shares one single-flight native refresh", async () => {
    await loadNative(async (url, options) => {
      if (url.endsWith("/api/auth/native/login")) {
        return json(200, { access_token: "nat-old", refresh_token: "nat-rt-1", user: USER });
      }
      if (url.endsWith("/api/auth/native/refresh")) {
        expect(JSON.parse(options.body)).toEqual({ refresh_token: "nat-rt-1" });
        await new Promise((r) => setTimeout(r, 15));
        return json(200, { access_token: "nat-new", refresh_token: "nat-rt-2", user: USER });
      }
      return options.headers.Authorization === "Bearer nat-new" ? json(200, ["ok"]) : json(401);
    });
    await authClient.login({ email: "ana@gmail.com", password: "pw" });
    const results = await Promise.all(Array.from({ length: 4 }, () => authClient.authFetch("/api/documents")));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(refreshCalls).toBe(1);
    expect(keystore.store.get("kabisado_refresh_token")).toBe("nat-rt-2");
    expect(authClient.getAccessToken()).toBe("nat-new");
  });

  it("wipes Keystore token and clears session when /api/auth/native/refresh returns 401 during authFetch", async () => {
    await loadNative((url) => {
      if (url.endsWith("/api/auth/native/login")) {
        return json(200, { access_token: "nat-acc", refresh_token: "nat-rt-1", user: USER });
      }
      return json(401, { detail: "expired" });
    });
    const seen = [];
    authClient.onAuthChange((u) => seen.push(u));
    await authClient.login({ email: "ana@gmail.com", password: "pw" });
    expect(keystore.store.get("kabisado_refresh_token")).toBe("nat-rt-1");

    const res = await authClient.authFetch("/api/documents");
    expect(res.status).toBe(401);
    expect(refreshCalls).toBe(1);
    expect(keystore.store.has("kabisado_refresh_token")).toBe(false);
    expect(authClient.getAccessToken()).toBeNull();
    expect(seen.at(-1)).toBeNull();
  });

  it("logout clears Keystore token and posts to /api/auth/native/logout", async () => {
    await loadNative((url) => {
      if (url.endsWith("/api/auth/native/login")) {
        return json(200, { access_token: "nat-acc", refresh_token: "nat-rt-1", user: USER });
      }
      if (url.endsWith("/api/auth/native/logout")) {
        return json(204);
      }
      return json(401, { detail: "expired" });
    });
    await authClient.login({ email: "ana@gmail.com", password: "pw" });
    await authClient.logout();
    expect(keystore.store.has("kabisado_refresh_token")).toBe(false);
    expect(authClient.getAccessToken()).toBeNull();
    const logoutCall = fetchMock.mock.calls.find(([u]) => u.endsWith("/api/auth/native/logout"));
    expect(logoutCall).toBeTruthy();
    expect(JSON.parse(logoutCall[1].body)).toEqual({ refresh_token: "nat-rt-1" });
  });

  it("notifies upgrade listeners when the server returns 426 Upgrade Required", async () => {
    await loadNative(() =>
      json(426, { detail: "Please update the Kabisado app to continue.", code: "UPGRADE_REQUIRED", min_version_code: 20000 })
    );
    const seen = [];
    const off = platform.onUpgradeRequired((payload) => seen.push(payload));
    const res = await authClient.authFetch("/api/documents");
    off();
    expect(res.status).toBe(426);
    expect(seen).toHaveLength(1);
    expect(seen[0].code).toBe("UPGRADE_REQUIRED");
  });
});
