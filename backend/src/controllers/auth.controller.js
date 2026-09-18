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

const getMe = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res
        .status(401)
        .json({ success: false, error: "Authentication required." });
    }
    const result = await authService.getMe(user);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const googleLogin = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const headerToken =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1].trim()
        : null;

    const { token, email, name, googleSub, branchId } = req.body;
    const effectiveToken = token || headerToken;
    if (!effectiveToken) {
      return res.status(401).json({
        success: false,
        error:
          "Supabase authentication token is required for Google login verification.",
      });
    }

    const result = await authService.googleLogin({
      token: effectiveToken,
      email,
      name,
      googleSub,
      branchId,
    });
    res.status(200).json(result);
  } catch (error) {
    if (error.code === "ACCOUNT_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        code: "ACCOUNT_NOT_FOUND",
        error: error.message,
      });
    }
    res.status(400).json({ success: false, error: error.message });
  }
};

const googleOnboard = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const headerToken =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1].trim()
        : null;

    const { token, ...onboardData } = req.body;
    const effectiveToken = token || headerToken;
    if (!effectiveToken) {
      return res.status(401).json({
        success: false,
        error:
          "Supabase authentication token is required for Google onboarding.",
      });
    }

    const result = await authService.googleOnboard({
      token: effectiveToken,
      ...onboardData,
    });
    res.status(201).json(result);
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
  getMe,
  login,
  pinLogin,
  register,
  googleLogin,
  googleOnboard,
  forgotPassword,
  resetPassword,
};
