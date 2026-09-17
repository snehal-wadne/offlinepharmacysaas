/**
 * Auth Controller
 *
 * Handles HTTP requests for:
 * - Supabase password login & user creation
 * - Verified Google OAuth session resolution
 * - Supabase password recovery flows
 */

const authService = require("../services/auth.service");

const login = async (req, res) => {
  try {
    const { emailOrPhone, password, email, branchId } = req.body;
    const result = await authService.login({
      emailOrPhone: emailOrPhone || email,
      password,
      branchId,
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(401).json({ success: false, error: error.message });
  }
};

const pinLogin = async (req, res) => {
  try {
    const { pin } = req.body;
    const result = await authService.pinLogin({ pin });
    res.status(200).json(result);
  } catch (error) {
    res.status(401).json({ success: false, error: error.message });
  }
};

const register = async (req, res) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

const googleLogin = async (req, res) => {
  try {
    const { token, email, name, googleSub, branchId } = req.body;
    const result = await authService.googleLogin({
      token,
      email,
      name,
      googleSub,
      branchId,
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await authService.forgotPassword({ email });
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const result = await authService.resetPassword({ token, newPassword });
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

module.exports = {
  login,
  pinLogin,
  register,
  googleLogin,
  forgotPassword,
  resetPassword,
};
