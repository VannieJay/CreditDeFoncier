const express = require('express');
const { body, validationResult } = require('express-validator');
const assetService = require('../services/assetService');
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

router.post('/transfer', authenticate, transferValidation, handleValidation, async (req, res, next) => {
  try {
    const { asset, address, amount } = req.body;
    const assetInfo = await assetService.getAssetBySymbol(asset);
    if (!assetInfo) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const available = await assetService.getAvailableBalance(req.user.id, asset);
    const fee = parseFloat(assetInfo.fee);
    const totalRequired = amount + fee;

    if (available < totalRequired) {
      return res.status(400).json({
        error: 'Insufficient balance',
        required: totalRequired.toFixed(6),
        available: available.toFixed(6),
      });
    }

    const usdValue = amount * parseFloat(assetInfo.price);

    const tx = await transactionService.createTransaction({
      userId: req.user.id,
      assetSymbol: asset,
      amount,
      address,
      usdValue,
      fee,
    });

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

module.exports = router;