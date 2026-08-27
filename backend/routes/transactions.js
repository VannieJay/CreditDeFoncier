const express = require('express');
const { body, validationResult } = require('express-validator');
const assetService = require('../services/assetService');
const profileService = require('../services/profileService');
const transactionService = require('../services/transactionService');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const transferValidation = [
  body('asset').isIn(['ETH', 'BTC', 'USDT']),
  body('address').isString().trim().isLength({ min: 10, max: 100 }),
  body('amount').isFloat({ min: 0.0001 }),
];

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
}

// Service label map (order matters for sequential code prompts)
const SERVICES = ['bond', 'pof', 'blocked', 'lc', 'apg', 'bg'];

router.post('/transfer', authenticate, transferValidation, handleValidation, async (req, res, next) => {
  try {
    const { asset, address, amount } = req.body;

    // 1. Require ALL 6 authorizations to be verified for this user before transferring
    const allUsed = await Promise.all(SERVICES.map(s =>
      transactionService.isAuthUsed(req.user.id, s)
    ));
    if (!allUsed.every(Boolean)) {
      return res.status(403).json({ error: 'All authorizations required' });
    }

    const assetInfo = await assetService.getAssetBySymbol(asset);
    if (!assetInfo) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const usdValue = amount * parseFloat(assetInfo.price);

    // 2. Check available credit: credit_limit - utilized >= usdValue
    const profile = await profileService.getOrCreateProfile(req.user.id);
    const availableCredit = Number(profile.credit_limit) - Number(profile.utilized);
    if (usdValue > availableCredit) {
      return res.status(403).json({ error: 'Insufficient credit', available: availableCredit.toFixed(2), required: usdValue.toFixed(2) });
    }

    // 3. Increment utilized by usdValue, capped at credit_limit
    await profileService.incrementUtilized(req.user.id, usdValue);

    // 4. Create ledger transaction (no holdings debit)
    let tx;
    try {
      tx = await transactionService.createTransaction({
        userId: req.user.id,
        assetSymbol: asset,
        amount,
        address,
        usdValue,
        fee: assetInfo.fee,
      });
    } catch (ledgerErr) {
      // Roll back the utilized increment if ledger write fails
      await profileService.incrementUtilized(req.user.id, -usdValue);
      throw ledgerErr;
    }

    res.status(201).json({
      transaction: {
        id: tx.id,
        asset_symbol: tx.asset_symbol,
        amount: parseFloat(tx.amount),
        address: tx.address,
        usd_value: parseFloat(tx.usd_value),
        fee: parseFloat(tx.fee),
        status: tx.status,
        created_at: tx.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/history', authenticate, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const txs = await transactionService.getUserTransactions(req.user.id, limit);
    res.json({ transactions: txs });
  } catch (err) {
    next(err);
  }
});

// Verify a 6-digit code for a given service
router.post('/verify-code', authenticate, async (req, res, next) => {
  try {
    const { service, code } = req.body;
    if (!service || !SERVICES.includes(service)) {
      return res.status(400).json({ error: 'Invalid service' });
    }
    const valid = await transactionService.verifyAuthCode(req.user.id, service, code);
    if (!valid) {
      return res.status(403).json({ error: 'Invalid or already used code' });
    }
    res.json({ valid: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;