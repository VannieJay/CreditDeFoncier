const express = require('express');
const assetService = require('../services/assetService');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const assets = await assetService.getAssets();
    res.json({ assets });
  } catch (err) {
    next(err);
  }
});

router.get('/holdings', authenticate, async (req, res, next) => {
  try {
    const holdings = await assetService.getUserHoldings(req.user.id);
    res.json({ holdings });
  } catch (err) {
    next(err);
  }
});

module.exports = router;