require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { validationResult, body } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(morgan('combined'));

// Rate limiting (100 requests per 15 minutes)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Mock database (replace with real DB in production)
const paymentsDb = {};

// HMAC Signature Generator
const generateSignature = (data) => {
  const hmac = crypto.createHmac('sha256', process.env.HMAC_SECRET);
  hmac.update(JSON.stringify(data));
  return hmac.digest('hex');
};

// Authentication Middleware
const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Add this health check endpoint at the TOP of your routes (before other middlewares)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Add a root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Payment API is running',
    endpoints: [
      'POST /api/redirect',
      'POST /api/payments/create',
      'POST /api/payments/capture',
      'POST /api/payments/refund',
      'POST /api/payments/cancel',
      'POST /api/callback'
    ]
  });
});

// 1. Redirect Endpoint (Wix → Your Payment Page)
app.post('/api/redirect', [
  body('orderId').notEmpty(),
  body('amount').isNumeric(),
  body('callbackUrls.success').isURL(),
  body('callbackUrls.failure').isURL(),
  body('callbackUrls.cancel').isURL()
], authenticate, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { orderId, amount, callbackUrls } = req.body;
  const paymentId = `pay_${uuidv4()}`;

  paymentsDb[paymentId] = {
    paymentId,
    orderId,
    amount,
    currency: req.body.currency || 'USD',
    status: 'pending',
    callbackUrls,
    createdAt: new Date().toISOString()
  };

  const token = crypto.randomBytes(16).toString('hex');
  const redirectUrl = `${process.env.PAYMENT_DOMAIN}/checkout?paymentId=${paymentId}&token=${token}`;

  res.json({
    redirectUrl,
    transactionId: `trans_${uuidv4()}`,
    status: 'pending'
  });
});

// 2. Create Payment Endpoint
app.post('/api/payments/create', [
  body('paymentId').notEmpty(),
  body('cardDetails.number').isCreditCard(),
  body('cardDetails.expiry').matches(/^\d{2}\/\d{2}$/),
  body('cardDetails.cvv').isLength({ min: 3, max: 4 })
], authenticate, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { paymentId, cardDetails } = req.body;
  const payment = paymentsDb[paymentId];

  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  // Mock payment processing (replace with real payment gateway)
  payment.status = 'created';
  payment.cardLast4 = cardDetails.number.slice(-4);
  payment.updatedAt = new Date().toISOString();

  res.json({
    paymentId,
    status: 'created',
    amount: payment.amount,
    currency: payment.currency,
    timestamp: payment.updatedAt
  });
});

// 3. Capture Payment Endpoint
app.post('/api/payments/capture', [
  body('paymentId').notEmpty(),
  body('amount').isNumeric()
], authenticate, (req, res) => {
  const { paymentId, amount } = req.body;
  const payment = paymentsDb[paymentId];

  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  if (payment.status !== 'created') {
    return res.status(400).json({ error: 'Payment not in creatable state' });
  }

  payment.status = 'captured';
  payment.capturedAmount = amount;
  payment.updatedAt = new Date().toISOString();

  // In production: Call payment gateway capture API here
  res.json({
    captureId: `cap_${uuidv4()}`,
    status: 'captured',
    amount,
    timestamp: payment.updatedAt
  });
});

// 4. Refund Payment Endpoint
app.post('/api/payments/refund', [
  body('paymentId').notEmpty(),
  body('amount').isNumeric()
], authenticate, (req, res) => {
  const { paymentId, amount } = req.body;
  const payment = paymentsDb[paymentId];

  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  if (payment.status !== 'captured') {
    return res.status(400).json({ error: 'Payment not refundable' });
  }

  payment.status = 'refunded';
  payment.refundedAmount = amount;
  payment.updatedAt = new Date().toISOString();

  res.json({
    refundId: `ref_${uuidv4()}`,
    status: 'refunded',
    amount,
    timestamp: payment.updatedAt
  });
});

// 5. Cancel Payment Endpoint
app.post('/api/payments/cancel', [
  body('paymentId').notEmpty()
], authenticate, (req, res) => {
  const { paymentId } = req.body;
  const payment = paymentsDb[paymentId];

  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  if (!['pending', 'created'].includes(payment.status)) {
    return res.status(400).json({ error: 'Payment not cancelable' });
  }

  payment.status = 'canceled';
  payment.updatedAt = new Date().toISOString();

  res.json({
    cancellationId: `can_${uuidv4()}`,
    status: 'canceled',
    timestamp: payment.updatedAt
  });
});

// 6. Callback Endpoint (Your Service → Wix)
app.post('/api/callback', [
  body('paymentId').notEmpty(),
  body('status').isIn(['success', 'failed', 'canceled'])
], (req, res) => {
  const { paymentId, status } = req.body;
  const payment = paymentsDb[paymentId];

  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  // Verify HMAC signature
  const signature = req.headers['x-signature'];
  const expectedSignature = generateSignature(req.body);
  if (signature !== expectedSignature) {
    return res.status(403).json({ error: 'Invalid signature' });
  }

  payment.status = status;
  payment.updatedAt = new Date().toISOString();

  // Determine Wix callback URL
  const callbackUrl = payment.callbackUrls[status];
  const signedCallbackUrl = `${callbackUrl}&sig=${generateSignature({ paymentId, status })}`;

  res.json({
    redirectUrl: signedCallbackUrl,
    status: 'callback_processed'
  });
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Payment API running on port ${PORT}`);
});