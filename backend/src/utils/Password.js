/**
 * Password Utility
 *
 * Thin wrapper around bcrypt so hashing behaviour (rounds) lives in
 * one place. Requires the `bcrypt` package (matches the "BCrypt-style
 * password hash" comment already in schema.sql).
 */

const bcrypt = require('bcrypt');
const crypto = require('crypto');

const SALT_ROUNDS = 10;

const hashPassword = async (plainPassword) => {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
};

/**
 * Generates a password hash for a user who has been invited but has
 * not chosen a password yet.
 *
 * The `users` table requires at least one of password_hash /
 * google_sub / supabase_auth_id to be set
 * (CONSTRAINT users_auth_method_check). An invited-but-not-yet-
 * onboarded user has none of those, so we hash a random,
 * never-communicated secret as a placeholder. It is cryptographically
 * impossible to log in with it, and it is overwritten the moment the
 * invited user accepts the invite and sets a real password.
 */
const generatePlaceholderPasswordHash = async () => {
  const randomSecret = crypto.randomBytes(32).toString('hex');
  return hashPassword(randomSecret);
};

const comparePassword = async (plainPassword, passwordHash) => {
  if (!passwordHash) return false;
  return bcrypt.compare(plainPassword, passwordHash);
};

module.exports = {
  hashPassword,
  generatePlaceholderPasswordHash,
  comparePassword,
};