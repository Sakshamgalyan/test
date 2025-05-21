const axios = require('axios');

class PaySecureService {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.merchantId = config.merchantId;
        this.apiUrl = config.apiUrl;
    }

    async createPayment(params) {
        try {
            const response = await axios.post(`${this.apiUrl}/payments`, {
                merchant_id: this.merchantId,
                amount: params.amount,
                currency: params.currency,
                payment_method: params.paymentMethod,
                order_id: params.orderId,
                customer: params.customer,
                callback_url: params.callbackUrl,
                redirect_url: params.redirectUrl
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            throw new Error(`PaySecure payment failed: ${error.message}`);
        }
    }

    async capturePayment(paymentId, amount) {
        return await axios.post(`${this.apiUrl}/payments/${paymentId}/capture`, {
            amount: amount
        }, {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`
            }
        });
    }

    async refundPayment(paymentId, amount) {
        return await axios.post(`${this.apiUrl}/payments/${paymentId}/refund`, {
            amount: amount
        }, {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`
            }
        });
    }

    verifyWebhookSignature(payload, signature) {
        const hmac = crypto.createHmac('sha256', this.apiKey);
        const expectedSignature = hmac.update(JSON.stringify(payload)).digest('hex');
        return signature === expectedSignature;
    }
}

module.exports = PaySecureService;