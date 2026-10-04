import { API_URL } from "../config";

function getStorageItem(key) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch (e) {}
  return null;
}

function setStorageItem(key, value) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      if (value) {
        window.localStorage.setItem(key, value);
      } else {
        window.localStorage.removeItem(key);
      }
    }
  } catch (e) {}
}

import { signOut, getAccessToken, refreshSession } from "./supabaseClient";

export function setAuthSession({ organisationId, token } = {}) {
  setStorageItem("organisationId", organisationId || "");
  if (token) {
    setStorageItem("authToken", token);
  }
}

export async function clearAuthSession() {
  setStorageItem("organisationId", "");
  setStorageItem("authToken", "");
  setStorageItem("superadminToken", "");
  try {
    await signOut();
  } catch (e) {}
}

const DEFAULT_TIMEOUT = 15000; // 15 seconds

export async function getAuthHeaders() {
  try {
    const localToken = getStorageItem("authToken");
    const superToken = getStorageItem("superadminToken");
    const supaToken = await getAccessToken().catch(() => null);
    const token = localToken || supaToken || superToken;
    const orgId = getStorageItem("organisationId");
    const validOrgId =
      orgId && orgId !== "undefined" && orgId !== "null" && orgId.trim()
        ? orgId.trim()
        : null;
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(validOrgId ? { "x-organisation-id": validOrgId } : {}),
    };
  } catch {
    return { "Content-Type": "application/json" };
  }
}

export async function apiRequest(endpoint, options = {}, isRetry = false) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    options.timeout || DEFAULT_TIMEOUT,
  );

  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401 && !isRetry) {
      const refreshedToken = await refreshSession().catch(() => null);
      if (refreshedToken) {
        return apiRequest(endpoint, options, true);
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      return {
        success: false,
        error:
          errorData.error || errorData.message || `HTTP ${response.status}`,
        status: response.status,
        isOffline: false,
      };
    }

    const data = await response.json();
    return { success: true, data, isOffline: false };
  } catch (err) {
    clearTimeout(timeoutId);
    const isOffline =
      err.name === "AbortError" ||
      err.message?.includes("Network") ||
      err.message?.includes("fetch");
    return {
      success: false,
      error: isOffline ? "Network unavailable" : err.message,
      isOffline,
      status: 0,
    };
  }
}

export function apiGet(endpoint, options = {}) {
  return apiRequest(endpoint, { method: "GET", ...options });
}

export function apiPost(endpoint, body, options = {}) {
  return apiRequest(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
    ...options,
  });
}

export function apiPut(endpoint, body, options = {}) {
  return apiRequest(endpoint, {
    method: "PUT",
    body: JSON.stringify(body),
    ...options,
  });
}

export function apiPatch(endpoint, body, options = {}) {
  return apiRequest(endpoint, { method: 'PATCH', body: JSON.stringify(body), ...options });
}

export function apiDelete(endpoint, options = {}) {
  return apiRequest(endpoint, { method: "DELETE", ...options });
}
