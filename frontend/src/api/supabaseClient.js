/**
 * Supabase Client for Frontend Application
 *
 * Provides client-side Supabase Auth operations:
 * - signInWithPassword
 * - signUp
 * - signInWithOAuth (Google)
 * - resetPasswordForEmail
 * - signOut
 * - getSession
 */

import { createClient } from "@supabase/supabase-js";

// Public Supabase configuration for client operations
export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://caczaozjaxqxzctphdfd.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhY3phb3pqYXhxeHpjdHBoZGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MTMwNTgsImV4cCI6MjEwNTE4OTA1OH0.FuhicfVh2FcNSD_RCQOMkEaLDxu459pOfqrC-rrV328";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Sign in using email and password
 */
export async function signInWithPassword({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * Sign up a new user (no email verification required)
 */
export async function signUp({ email, password, name }) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: { name: name?.trim() },
    },
  });
  if (error) throw error;
  return data;
}

/**
 * Sign in / Sign up with Google OAuth
 * @param {Object} options
 * @param {'login'|'signup'} [options.mode='login']
 */
export async function signInWithGoogle({ mode = "login" } = {}) {
  const frontendUrl =
    process.env.EXPO_PUBLIC_APP_URL ||
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://localhost:8081");

  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      window.sessionStorage.setItem("pharmaflow_auth_intent", mode);
    } catch (e) {}
  }

  const redirectTo = `${frontendUrl}/?auth_intent=${encodeURIComponent(mode)}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });
  if (error) throw error;
  return data;
}

/**
 * Explicitly refresh the current session
 */
export async function refreshSession() {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;
  return data?.session || null;
}

/**
 * Request password recovery email
 */
export async function resetPasswordForEmail(email) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
  );
  if (error) throw error;
  return data;
}

/**
 * Sign out and clear local session
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) console.warn("Supabase sign out warning:", error.message);
}

/**
 * Obtain current active session
 */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

/**
 * Get current access token
 */
export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token || null;
}
