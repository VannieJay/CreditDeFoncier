const express = require('express');
const profileService = require('../services/profileService');
const { authenticate } = require('../middleware/auth');
const { profileValidation, handleValidation } = require('../middleware/validate');

const router = express.Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const profile = await profileService.getOrCreateProfile(req.user.id);
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

router.put('/', authenticate, profileValidation, handleValidation, async (req, res, next) => {
  try {
    const profile = await profileService.updateProfile(req.user.id, req.body);
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

module.exports = router;