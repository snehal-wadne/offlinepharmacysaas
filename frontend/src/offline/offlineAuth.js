/**
 * Offline Authentication
 *
 * - Stores a salted PBKDF2 hash of the password after every successful online
 *   sign-in, so the same credentials can be verified with no network.
 * - Queues sign-ups made offline and replays them against /api/auth/register
 *   once connectivity returns, then swaps the provisional account for the real one.
 */

import { API_URL } from "../config";
import { db } from "../db/pharmaflowDb";

const CREDENTIALS_KEY = "offlineCredentials";
const PENDING_SIGNUPS_KEY = "pendingSignups";
const PBKDF2_ITERATIONS = 150000;

const store = {
  get(key, fallback) {
    try {
      const raw = window.localStorage?.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage?.setItem(key, JSON.stringify(value));
    } catch (e) {}
  },
};

const normEmail = (email) => String(email || "").trim().toLowerCase();

const toHex = (buf) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(arr);
  return toHex(arr);
}

async function derive(password, saltHex) {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(saltHex), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return toHex(bits);
}

export function isOfflineAuthSupported() {
  return typeof globalThis.crypto?.subtle?.deriveBits === "function";
}

/** Remember credentials for offline use. Call after a successful ONLINE sign-in. */
export async function saveOfflineCredential(email, password, user, token) {
  if (!isOfflineAuthSupported() || !email || !password || !user) return;
  const salt = randomHex();
  const hash = await derive(password, salt);
  const all = store.get(CREDENTIALS_KEY, {});
  all[normEmail(email)] = { salt, hash, user, token: token || null, savedAt: Date.now() };
  store.set(CREDENTIALS_KEY, all);
}

/** Returns { user, token } when email+password match a stored credential, else null. */
export async function verifyOfflineLogin(email, password) {
  if (!isOfflineAuthSupported()) return null;
  const entry = store.get(CREDENTIALS_KEY, {})[normEmail(email)];
  if (!entry) return null;
  const hash = await derive(password, entry.salt);
  if (hash !== entry.hash) return null;
  return { user: { ...entry.user, isOffline: true }, token: entry.token };
}

export function hasOfflineCredential(email) {
  return Boolean(store.get(CREDENTIALS_KEY, {})[normEmail(email)]);
}

export function getPendingSignups() {
  return store.get(PENDING_SIGNUPS_KEY, []);
}

/**
 * Create an account while offline.
 * `payload` is the exact body that /api/auth/register expects (includes password).
 * Returns the provisional user (same shape the app expects from the backend).
 */
export async function createOfflineSignup(payload) {
  if (!isOfflineAuthSupported()) {
    throw new Error("Offline sign-up needs a secure (HTTPS or localhost) context.");
  }
  const email = normEmail(payload.email);
  if (hasOfflineCredential(email) || getPendingSignups().some((p) => p.email === email)) {
    throw new Error("An account with this email already exists on this device.");
  }

  const isSupplier = payload.accountType === "SUPPLIER";
  const isStaff = payload.accountType === "STAFF";
  const provisionalOrgId = `offline-org-${randomHex(8)}`;
  const user = {
    id: `offline-user-${randomHex(8)}`,
    email,
    name: payload.adminName || payload.name || payload.contactPerson || payload.companyName || email,
    companyName: payload.companyName,
    phone: payload.phone,
    role: isSupplier ? "SUPPLIER" : isStaff ? "STAFF" : "OWNER",
    isOwner: !isSupplier && !isStaff,
    organisationId: provisionalOrgId,
    organisationName: payload.pharmacyName,
    pharmacyMode: payload.pharmacyMode,
    hasBranch: !isSupplier && !isStaff,
    branchName: payload.branchName,
    pendingRegistration: true,
    isOffline: true,
  };
  const token = `offline-${randomHex(16)}`;

  const queue = getPendingSignups();
  queue.push({ email, payload, provisionalOrgId, provisionalUserId: user.id, queuedAt: Date.now() });
  store.set(PENDING_SIGNUPS_KEY, queue);

  await saveOfflineCredential(email, payload.password, user, token);
  return { user, token };
}

const ORG_SCOPED_TABLES = [
  "products", "customers", "inventory", "transactions", "sync_outbox",
  "cash_registers", "register_sessions", "cash_movements", "cash_denominations",
  "purchases", "audit_logs", "branches", "users", "suppliers",
];

/**
 * Point every locally stored row at the real organisation id.
 * Best effort: the web build swaps Dexie for a shim without `db.tables`, and a failure
 * here must never stop the account from being switched to its real session.
 */
async function remapOrganisation(oldId, newId) {
  if (!oldId || !newId || oldId === newId) return;
  for (const name of ORG_SCOPED_TABLES) {
    try {
      await db[name]?.where("organisationId").equals(oldId).modify({ organisationId: newId });
    } catch (e) {
      console.warn(`Org remap skipped for ${name}:`, e?.message);
    }
  }
}

let syncing = false;
let sessionSwapped = false;

/**
 * Replay queued sign-ups. Safe to call repeatedly; no-ops when offline or empty.
 * Returns the number of accounts successfully created.
 */
export async function syncPendingSignups() {
  if (syncing || typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  const queue = getPendingSignups();
  if (!queue.length) return 0;
  syncing = true;
  let created = 0;
  const remaining = [];

  try {
    for (const item of queue) {
      try {
        const res = await fetch(`${API_URL}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload),
        });
        let data = await res.json().catch(() => ({}));

        // Account may already exist (e.g. an earlier attempt registered it but the reply was lost).
        const alreadyExists = !res.ok && /already exists/i.test(data.error || "");
        if ((!res.ok || !data.success) && !alreadyExists) {
          // 4xx is permanent (validation etc.): record it instead of retrying forever.
          if (res.status >= 400 && res.status < 500) {
            const failed = store.get("failedSignups", []);
            failed.push({ email: item.email, error: data.error || `HTTP ${res.status}`, at: Date.now() });
            store.set("failedSignups", failed);
          } else {
            remaining.push(item);
          }
          continue;
        }

        // /api/auth/register does not return a token, so sign in to get a real one.
        let token = data.token || null;
        let realUser = data.user || null;
        if (!token) {
          const loginRes = await fetch(`${API_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: item.email, password: item.payload.password }),
          });
          const loginData = await loginRes.json().catch(() => ({}));
          if (loginRes.ok && loginData.success && loginData.token) {
            token = loginData.token;
            realUser = loginData.user || realUser;
          } else if (loginRes.status >= 400 && loginRes.status < 500) {
            const failed = store.get("failedSignups", []);
            failed.push({ email: item.email, error: loginData.error || "Could not sign in after registering", at: Date.now() });
            store.set("failedSignups", failed);
            continue;
          } else {
            remaining.push(item);
            continue;
          }
        }

        await remapOrganisation(item.provisionalOrgId, realUser?.organisationId);

        // Replace provisional credential/session with the real ones.
        const creds = store.get(CREDENTIALS_KEY, {});
        if (creds[item.email]) {
          creds[item.email].user = { ...realUser };
          creds[item.email].token = token || null;
          store.set(CREDENTIALS_KEY, creds);
        }
        const cachedStr = window.localStorage?.getItem("cachedAuthUser");
        const cached = cachedStr ? JSON.parse(cachedStr) : null;
        if (cached?.id === item.provisionalUserId) {
          window.localStorage?.setItem("authToken", token);
          window.localStorage?.setItem("cachedAuthUser", JSON.stringify({ ...realUser, token }));
          if (realUser?.organisationId) {
            window.localStorage?.setItem("organisationId", realUser.organisationId);
          }
          sessionSwapped = true;
        }
        created += 1;
      } catch (e) {
        console.warn("Pending sign-up sync failed, will retry:", e?.message);
        remaining.push(item); // retry later
      }
    }
  } finally {
    store.set(PENDING_SIGNUPS_KEY, remaining);
    syncing = false;
  }

  if (created && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pharmaflow:signups-synced", { detail: { created } }));
    // The running app still holds the provisional user/org in memory: restart it on the real session.
    if (sessionSwapped) {
      sessionSwapped = false;
      window.location.reload();
    }
  }
  return created;
}

/** True when the current session is a provisional one that has not been registered yet. */
export function hasProvisionalSession() {
  try {
    return String(window.localStorage?.getItem("authToken") || "").startsWith("offline-");
  } catch (e) {
    return false;
  }
}

/** Start retrying queued sign-ups whenever the browser comes back online. */
export function initOfflineAuthSync() {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => {
    syncPendingSignups();
  });
  syncPendingSignups();
}
