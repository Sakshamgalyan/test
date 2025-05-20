export function createError(code, message) {
  return {
    code,
    message,
    toString() {
      return `${code}: ${message}`;
    }
  };
}

export const errors = {
  CREATE_PAYMENT_FAILED: {
    code: 'CREATE_PAYMENT_FAILED',
    message: 'Failed to create payment'
  },
  CAPTURE_PAYMENT_FAILED: {
    code: 'CAPTURE_PAYMENT_FAILED',
    message: 'Failed to capture payment'
  },
  REFUND_PAYMENT_FAILED: {
    code: 'REFUND_PAYMENT_FAILED',
    message: 'Failed to refund payment'
  },
  CANCEL_PAYMENT_FAILED: {
    code: 'CANCEL_PAYMENT_FAILED',
    message: 'Failed to cancel payment'
  },
  GET_STATUS_FAILED: {
    code: 'GET_STATUS_FAILED',
    message: 'Failed to get payment status'
  }
};