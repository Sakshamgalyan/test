import { createError } from './errors';

// This is the main payment provider implementation
export function getPaymentProvider() {
  return {
    name: 'YourPaymentGateway',
    paymentMethod: 'credit_card',
    createPayment: createPayment,
    capturePayment: capturePayment,
    refundPayment: refundPayment,
    cancelPayment: cancelPayment,
    getPaymentStatus: getPaymentStatus
  };
}

// Create a new payment
async function createPayment(paymentInfo, requestOptions) {
  try {
    const response = await fetch('https://yourgateway.com/api/redirect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${requestOptions.apiKey}`
      },
      body: JSON.stringify({
        orderId: paymentInfo.wixOrderId,
        amount: paymentInfo.amount,
        currency: paymentInfo.currency,
        customer: {
          email: paymentInfo.buyerInfo.email,
          firstName: paymentInfo.buyerInfo.firstName,
          lastName: paymentInfo.buyerInfo.lastName
        },
        callbackUrls: {
          success: paymentInfo.callbackUrls.success,
          failure: paymentInfo.callbackUrls.failure,
          cancel: paymentInfo.callbackUrls.cancel
        },
        metadata: {
          wixSiteId: requestOptions.instanceId,
          wixAppInstanceId: requestOptions.appInstanceId
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw createError('CREATE_PAYMENT_FAILED', error.message || 'Failed to create payment');
    }
    
    const data = await response.json();
    
    return {
      paymentId: data.transactionId,
      redirectUrl: data.redirectUrl
    };
    
  } catch (error) {
    console.error('Create payment error:', error);
    throw createError('CREATE_PAYMENT_FAILED', error.message || 'Failed to create payment');
  }
}

// Capture an authorized payment
async function capturePayment(paymentId, requestOptions) {
  try {
    const response = await fetch(`https://yourgateway.com/api/payments/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${requestOptions.apiKey}`
      },
      body: JSON.stringify({
        paymentId,
        amount: requestOptions.amount
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw createError('CAPTURE_PAYMENT_FAILED', error.message || 'Failed to capture payment');
    }
    
    const data = await response.json();
    
    return {
      captureId: data.captureId,
      status: data.status,
      amount: data.amount
    };
    
  } catch (error) {
    console.error('Capture payment error:', error);
    throw createError('CAPTURE_PAYMENT_FAILED', error.message || 'Failed to capture payment');
  }
}

// Refund a captured payment
async function refundPayment(paymentId, requestOptions) {
  try {
    const response = await fetch(`https://yourgateway.com/api/payments/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${requestOptions.apiKey}`
      },
      body: JSON.stringify({
        paymentId,
        amount: requestOptions.amount,
        reason: requestOptions.reason || 'Refund requested'
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw createError('REFUND_PAYMENT_FAILED', error.message || 'Failed to refund payment');
    }
    
    const data = await response.json();
    
    return {
      refundId: data.refundId,
      status: data.status,
      amount: data.amount
    };
    
  } catch (error) {
    console.error('Refund payment error:', error);
    throw createError('REFUND_PAYMENT_FAILED', error.message || 'Failed to refund payment');
  }
}

// Cancel a payment
async function cancelPayment(paymentId, requestOptions) {
  try {
    const response = await fetch(`https://yourgateway.com/api/payments/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${requestOptions.apiKey}`
      },
      body: JSON.stringify({
        paymentId,
        reason: requestOptions.reason || 'Payment canceled'
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw createError('CANCEL_PAYMENT_FAILED', error.message || 'Failed to cancel payment');
    }
    
    const data = await response.json();
    
    return {
      cancellationId: data.cancellationId,
      status: data.status
    };
    
  } catch (error) {
    console.error('Cancel payment error:', error);
    throw createError('CANCEL_PAYMENT_FAILED', error.message || 'Failed to cancel payment');
  }
}

// Get payment status
async function getPaymentStatus(paymentId, requestOptions) {
  try {
    const response = await fetch(`https://yourgateway.com/api/payments/${paymentId}/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${requestOptions.apiKey}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw createError('GET_STATUS_FAILED', error.message || 'Failed to get payment status');
    }
    
    const data = await response.json();
    
    return {
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      processedAt: data.timestamp
    };
    
  } catch (error) {
    console.error('Get status error:', error);
    throw createError('GET_STATUS_FAILED', error.message || 'Failed to get payment status');
  }
}