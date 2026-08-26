const { body, validationResult } = require('express-validator');

const registerValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').optional().isIn(['individual', 'corporate']),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isString().trim().not().isEmpty(),
];

const transferValidation = [
  body('asset').isIn(['ETH', 'BTC', 'USDT']),
  body('address').isString().trim().isLength({ min: 10, max: 100 }),
  body('amount').isFloat({ min: 0.0001 }).withMessage('Amount must be a positive number'),
];

const profileValidation = [
  body('name').optional().isString().trim().isLength({ max: 120 }),
  body('client_id').optional().isString().trim().isLength({ max: 60 }),
  body('tax_id').optional().isString().trim().isLength({ max: 60 }),
  body('tier').optional().isIn(['Tier 1', 'Tier 2', 'Tier 3']),
  body('kyc_status').optional().isIn(['pending', 'in_review', 'verified', 'rejected']),
  body('credit_limit').optional().isFloat({ min: 0 }),
  body('identity_verified').optional().isBoolean(),
  body('business_registered').optional().isBoolean(),
  body('liquidity_verified').optional().isBoolean(),
];

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
}

module.exports = {
  registerValidation,
  loginValidation,
  transferValidation,
  profileValidation,
  handleValidation,
};