const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors());

const config = {
  apiKey: process.env.API_KEY || 'your_secret_key',
  hmacSecret: process.env.HMAC_SECRET || 'your_hmac_secret',
  wixAuthToken: process.env.WIX_AUTH_TOKEN || 'wix_auth_token'
};

// In-memory database for demo (use a real DB in production)
const paymentsDb = {};

// Helper function to generate HMAC signature
function generateSignature(data) {
  const hmac = crypto.createHmac('sha256', config.hmacSecret);
  hmac.update(JSON.stringify(data));
  return hmac.digest('hex');
}

// 1. Redirect API - From Wix to Your Payment Page
app.post('/api/redirect', (req, res) => {
  try {
    const { orderId, amount, currency, callbackUrls } = req.body;
    
    // Validate input
    if (!orderId || !amount || !currency || !callbackUrls) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Create payment record
    const paymentId = `pay_${uuidv4()}`;
    const transactionId = `trans_${uuidv4()}`;
    
    paymentsDb[paymentId] = {
      paymentId,
      orderId,
      amount,
      currency,
      status: 'pending',
      createdAt: new Date().toISOString(),
      callbackUrls
    };
    
    // Generate redirect URL with token
    const token = crypto.randomBytes(16).toString('hex');
    const redirectUrl = `https://yourpaymentgateway.com/checkout?paymentId=${paymentId}&token=${token}`;
    
    res.json({
      redirectUrl,
      transactionId,
      status: 'redirect'
    });
    
  } catch (error) {
    console.error('Redirect error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Payment Creation API
app.post('/api/payments/create', (req, res) => {
  try {
    const { paymentId, paymentMethod, cardDetails } = req.body;
    
    if (!paymentsDb[paymentId]) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    // In a real implementation, you would process the payment with your payment processor here
    // This is a mock implementation
    
    // Validate card (mock validation)
    if (paymentMethod === 'credit_card') {
      if (!cardDetails || !cardDetails.number || !cardDetails.expiry || !cardDetails.cvv) {
        return res.status(400).json({ error: 'Invalid card details' });
      }
      
      // Simple Luhn check for demo
      if (!validateCardNumber(cardDetails.number)) {
        return res.status(400).json({ error: 'Invalid card number' });
      }
    }
    
    // Update payment status
    paymentsDb[paymentId].status = 'created';
    paymentsDb[paymentId].paymentMethod = paymentMethod;
    paymentsDb[paymentId].updatedAt = new Date().toISOString();
    
    res.json({
      paymentId,
      status: 'created',
      amount: paymentsDb[paymentId].amount,
      currency: paymentsDb[paymentId].currency,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Payment creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Payment Capture API
app.post('/api/payments/capture', (req, res) => {
  try {
    const { paymentId, amount } = req.body;
    
    if (!paymentsDb[paymentId]) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    if (paymentsDb[paymentId].status !== 'created') {
      return res.status(400).json({ error: 'Payment not in creatable state' });
    }
    
    // In a real implementation, you would capture funds with your payment processor here
    
    // Update payment status
    paymentsDb[paymentId].status = 'captured';
    paymentsDb[paymentId].capturedAmount = amount;
    paymentsDb[paymentId].updatedAt = new Date().toISOString();
    
    // Notify Wix
    notifyWix(paymentId, 'captured');
    
    res.json({
      captureId: `cap_${uuidv4()}`,
      status: 'captured',
      amount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Capture error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Payment Refund API
app.post('/api/payments/refund', (req, res) => {
  try {
    const { paymentId, amount, reason } = req.body;
    
    if (!paymentsDb[paymentId]) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    if (paymentsDb[paymentId].status !== 'captured') {
      return res.status(400).json({ error: 'Payment not in refundable state' });
    }
    
    // In a real implementation, you would process refund with your payment processor here
    
    // Update payment status
    paymentsDb[paymentId].status = 'refunded';
    paymentsDb[paymentId].refundedAmount = amount;
    paymentsDb[paymentId].refundReason = reason;
    paymentsDb[paymentId].updatedAt = new Date().toISOString();
    
    // Notify Wix
    notifyWix(paymentId, 'refunded');
    
    res.json({
      refundId: `ref_${uuidv4()}`,
      status: 'refunded',
      amount,
      reason,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. Payment Cancel API
app.post('/api/payments/cancel', (req, res) => {
  try {
    const { paymentId, reason } = req.body;
    
    if (!paymentsDb[paymentId]) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    if (!['pending', 'created'].includes(paymentsDb[paymentId].status)) {
      return res.status(400).json({ error: 'Payment not in cancelable state' });
    }
    
    // Update payment status
    paymentsDb[paymentId].status = 'canceled';
    paymentsDb[paymentId].cancelReason = reason;
    paymentsDb[paymentId].updatedAt = new Date().toISOString();
    
    // Notify Wix
    notifyWix(paymentId, 'canceled');
    
    res.json({
      cancellationId: `can_${uuidv4()}`,
      status: 'canceled',
      reason,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Cancel error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 6. Callback API - From Your Payment Page to Wix
app.post('/api/callback', async (req, res) => {
  try {
    const { paymentId, status } = req.body;
    
    if (!paymentsDb[paymentId]) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    // Validate status
    if (!['success', 'failed', 'canceled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    // Update payment status
    paymentsDb[paymentId].status = status;
    paymentsDb[paymentId].updatedAt = new Date().toISOString();
    
    // Determine redirect URL based on status
    let redirectUrl;
    switch(status) {
      case 'success':
        redirectUrl = paymentsDb[paymentId].callbackUrls.success;
        break;
      case 'failed':
        redirectUrl = paymentsDb[paymentId].callbackUrls.failure;
        break;
      case 'canceled':
        redirectUrl = paymentsDb[paymentId].callbackUrls.cancel;
        break;
    }
    
    // Add signature to redirect URL for security
    const signature = generateSignature({ paymentId, status });
    redirectUrl += `&sig=${signature}`;
    
    res.json({
      redirectUrl,
      status: 'callback_processed',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to notify Wix (webhook)
async function notifyWix(paymentId, eventType) {
  try {
    const payment = paymentsDb[paymentId];
    if (!payment) return;
    
    const payload = {
      eventType,
      paymentId,
      orderId: payment.orderId,
      amount: payment.amount,
      currency: payment.currency,
      timestamp: new Date().toISOString()
    };
    
    // Add HMAC signature
    payload.signature = generateSignature(payload);
    
    // In a real implementation, you would send this to Wix's webhook URL
    // await axios.post(payment.callbackUrls.webhook, payload, {
    //   headers: {
    //     'Authorization': `Bearer ${config.wixAuthToken}`,
    //     'Content-Type': 'application/json'
    //   }
    // });
    
    console.log(`Notified Wix about ${eventType} for payment ${paymentId}`);
    
  } catch (error) {
    console.error('Error notifying Wix:', error);
  }
}

// Helper function for card validation (Luhn algorithm)
function validateCardNumber(cardNumber) {
  // Remove non-digit characters
  const cleaned = cardNumber.replace(/\D/g, '');
  
  // Check if the card number is valid using Luhn algorithm
  let sum = 0;
  let shouldDouble = false;
  
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned.charAt(i), 10);
    
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  
  return (sum % 10) === 0;
}

// Start server
app.listen(PORT, () => {
  console.log(`Payment plugin server running on port ${PORT}`);
});