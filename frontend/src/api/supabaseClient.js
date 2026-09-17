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
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key_for_client_initialization";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
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
 * Sign in with Google OAuth
 */
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
  });
  if (error) throw error;
  return data;
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
