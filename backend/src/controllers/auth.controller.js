/**
 * Auth Controller
 */

const authService = require('../services/auth.service');

const login = async (req, res) => {
  try {
    const { emailOrPhone, password, email } = req.body;
    const identifier = emailOrPhone || email;
    const result = await authService.login({ emailOrPhone: identifier, password, branchId: req.body.branchId });
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
    const { email, name, googleSub, role, branchId } = req.body;
    const result = await authService.googleLogin({
      email,
      name,
      googleSub,
      role,
      branchId,
    });
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
};

