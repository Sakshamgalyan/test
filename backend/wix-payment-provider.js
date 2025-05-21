const crypto = require('crypto');
const axios = require('axios');

class WixPaymentProvider {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.apiUrl = config.apiUrl;
        this.hmacSecret = config.hmacSecret;
    }

    async createTransaction(params) {
        try {
            const response = await axios.post(`${this.apiUrl}/api/redirect`, {
                orderId: params.orderId,
                amount: params.amount,
                currency: params.currency,
                callbackUrls: {
                    success: params.successUrl,
                    failure: params.failureUrl,
                    cancel: params.cancelUrl
                }
            }, {
                headers: {
                    'x-api-key': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });

            return {
                transactionId: response.data.transactionId,
                redirectUrl: response.data.redirectUrl,
                status: response.data.status
            };
        } catch (error) {
            throw new Error(`Payment creation failed: ${error.message}`);
        }
    }

    verifyCallback(requestBody, signature) {
        const expectedSignature = crypto
            .createHmac('sha256', this.hmacSecret)
            .update(JSON.stringify(requestBody))
            .digest('hex');
        
        return signature === expectedSignature;
    }
}