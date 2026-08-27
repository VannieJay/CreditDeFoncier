const express = require('express');
const adminService = require('../services/adminService');
const authService = require('../services/authService');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  registerValidation,
  adminStatusValidation,
  adminKycValidation,
  idParamValidation,
  handleValidation,
} = require('../middleware/validate');

// Every route here requires an authenticated admin.
const router = express.Router();
router.use(authenticate, requireRole('admin'));

router.get('/users', async (req, res, next) => {
  try {
    const users = await adminService.listUsers();
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

router.post('/users', registerValidation, handleValidation, async (req, res, next) => {
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
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

router.patch('/users/:id/status', adminStatusValidation, handleValidation, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id && req.body.active === false) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }
    const updated = await adminService.setUserActive(req.params.id, req.body.active);
    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json({ user: updated });
  } catch (err) {
    next(err);
  }
});

router.patch('/users/:id/kyc', adminKycValidation, handleValidation, async (req, res, next) => {
  try {
    const { kyc_status, identity_verified, business_registered, liquidity_verified } = req.body;
    const updated = await adminService.completeKyc(req.params.id, {
      ...(kyc_status ? { kyc_status } : {}),
      ...(identity_verified !== undefined ? { identity_verified } : {}),
      ...(business_registered !== undefined ? { business_registered } : {}),
      ...(liquidity_verified !== undefined ? { liquidity_verified } : {}),
    });
    if (!updated) return res.status(404).json({ error: 'Profile not found for this user' });
    res.json({ profile: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id', idParamValidation, handleValidation, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    const deleted = await adminService.deleteUser(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'User not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/auth-code', async (req, res, next) => {
  try {
    const { service } = req.body;
    if (!service || !['bond', 'pof', 'blocked', 'lc', 'apg', 'bg'].includes(service)) {
      return res.status(400).json({ error: 'Invalid service' });
    }
    const generated = await adminService.generateAuthCode(req.params.id, service);
    res.json({ code: String(generated.code), service });
  } catch (err) {
    next(err);
  }
});

module.exports = router;