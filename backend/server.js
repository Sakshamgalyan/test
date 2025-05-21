require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { validationResult, body } = require('express-validator');
const cors = require('cors');
const path = require('path');
const PaySecureService = require('./services/paysecure');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(morgan('combined'));

app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/checkout', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/checkout/checkout.html'));
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

const paymentsDb = {};

const generateSignature = (data) => {
  const hmac = crypto.createHmac('sha256', process.env.HMAC_SECRET);
  hmac.update(JSON.stringify(data));
  return hmac.digest('hex');
};

app.use((req, res, next) => {
    const wixInstance = req.headers['x-wix-instance'];
    if (wixInstance) {
        try {
            const decoded = JSON.parse(Buffer.from(wixInstance, 'base64').toString());
            req.wixInstance = decoded;
        } catch (error) {
            console.error('Invalid Wix instance header:', error);
        }
    }
    next();
});

const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const wixSignature = req.headers['x-wix-signature'];
    
    if (apiKey === process.env.API_KEY || 
        (wixSignature && verifyWixSignature(req, wixSignature))) {
        return next();
    }
    
    return res.status(401).json({ error: 'Unauthorized' });
};

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

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

const paySecure = new PaySecureService({
    apiKey: process.env.PAYSECURE_API_KEY,
    merchantId: process.env.PAYSECURE_MERCHANT_ID,
    apiUrl: process.env.PAYSECURE_API_URL
});

app.post('/api/payments/create', [
    body('paymentId').notEmpty(),
    body('amount').isNumeric(),
    body('paymentMethod').isIn(['card', 'upi', 'netbanking', 'wallet'])
], authenticate, async (req, res) => {
    try {
        const { paymentId, amount, paymentMethod, customer } = req.body;

        const paySecureResponse = await paySecure.createPayment({
            amount,
            currency: 'INR',
            paymentMethod,
            orderId: paymentId,
            customer,
            callbackUrl: `${process.env.PAYMENT_DOMAIN}/api/callback`,
            redirectUrl: `${process.env.PAYMENT_DOMAIN}/checkout/result`
        });

        paymentsDb[paymentId] = {
            id: paymentId,
            status: 'created',
            paySecurePaymentId: paySecureResponse.id,
            amount,
            paymentMethod,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        res.json({
            paymentId,
            status: 'created',
            redirectUrl: paySecureResponse.redirect_url,
            timestamp: paymentsDb[paymentId].createdAt
        });
    } catch (error) {
        console.error('Payment creation failed:', error);
        res.status(500).json({ error: 'Payment creation failed' });
    }
});

app.post('/api/payments/capture', [
  body('paymentId').notEmpty(),
  body('amount').isNumeric()
], authenticate, (req, res) => {
  const { paymentId, amount } = req.body;
  const payment = paymentsDb[paymentId];

  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  
  payment.status = 'captured';
  payment.capturedAmount = amount;
  payment.updatedAt = new Date().toISOString();

  res.json({
    paymentId,
    status: 'captured',
    amount,
    timestamp: payment.updatedAt
  });
});

app.post('/api/payments/refund', [
  body('paymentId').notEmpty(),
  body('amount').isNumeric()
], authenticate, (req, res) => {
  const { paymentId, amount } = req.body;
  const payment = paymentsDb[paymentId];

  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
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

app.post('/api/callback', async (req, res) => {
    const signature = req.headers['x-paysecure-signature'];
    
    if (!paySecure.verifyWebhookSignature(req.body, signature)) {
        return res.status(403).json({ error: 'Invalid signature' });
    }

    const { payment_id, status, order_id } = req.body;
    const payment = paymentsDb[order_id];

    if (!payment) {
        return res.status(404).json({ error: 'Payment not found' });
    }

    payment.status = status;
    payment.updatedAt = new Date().toISOString();

    res.json({ status: 'callback_processed' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Payment API running on port ${PORT}`);
  });
}