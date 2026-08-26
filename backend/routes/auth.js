const express = require('express');
const authService = require('../services/authService');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  registerValidation,
  loginValidation,
  handleValidation,
} = require('../middleware/validate');

const router = express.Router();

// Admin-only account creation (public signup removed).
router.post(
  '/register',
  authenticate,
  requireRole('admin'),
  registerValidation,
  handleValidation,
  async (req, res, next) => {
    try {
      const { email, password, role, name, client_id, tier, credit_limit } = req.body;
      const existing = await authService.findUserByEmail(email);
      if (existing) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      const user = await authService.createUser({
        email,
        password,
        role: role || 'individual',
        profile: { name, client_id, tier, credit_limit },
      });
      // No token returned: accounts are created by admin, users log in themselves.
      res.status(201).json({ user });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/login', loginValidation, handleValidation, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await authService.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (user.active === false) {
      return res.status(403).json({ error: 'Account deactivated. Contact your administrator.' });
    }
    const ok = await authService.verifyPassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = authService.signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await authService.findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;