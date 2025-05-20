
// Get payment ID from URL
const urlParams = new URLSearchParams(window.location.search);
const paymentId = urlParams.get('paymentId');
const token = urlParams.get('token');

// Fetch payment details from backend
async function fetchPaymentDetails() {
    try {
        const response = await fetch(`/api/payments/${paymentId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch payment details');
        }

        const payment = await response.json();

        // Update UI with order details
        document.getElementById('order-id').textContent = `Order ID: ${payment.orderId}`;
        document.getElementById('order-amount').textContent = `Amount: ${payment.currency} ${payment.amount.toFixed(2)}`;

        return payment;

    } catch (error) {
        console.error('Error fetching payment details:', error);
        alert('Error loading payment details. Please try again.');
        // In a real implementation, you might redirect back to Wix with an error
    }
}

// Handle form submission
document.getElementById('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validate form
    const cardNumber = document.getElementById('card-number').value;
    const cardExpiry = document.getElementById('card-expiry').value;
    const cardCvv = document.getElementById('card-cvv').value;
    const cardName = document.getElementById('card-name').value;

    let isValid = true;

    // Simple validation
    if (!cardNumber || cardNumber.replace(/\s/g, '').length < 16) {
        document.getElementById('card-number-error').textContent = 'Invalid card number';
        isValid = false;
    } else {
        document.getElementById('card-number-error').textContent = '';
    }

    if (!cardExpiry || !cardExpiry.match(/^\d{2}\/\d{2}$/)) {
        document.getElementById('card-expiry-error').textContent = 'Invalid expiry date (MM/YY)';
        isValid = false;
    } else {
        document.getElementById('card-expiry-error').textContent = '';
    }

    if (!cardCvv || cardCvv.length < 3) {
        document.getElementById('card-cvv-error').textContent = 'Invalid CVV';
        isValid = false;
    } else {
        document.getElementById('card-cvv-error').textContent = '';
    }

    if (!isValid) return;

    // Disable button to prevent multiple submissions
    document.getElementById('pay-button').disabled = true;

    try {
        // Get payment details
        const payment = await fetchPaymentDetails();

        // Create payment
        const response = await fetch('/api/payments/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                paymentId: payment.paymentId,
                paymentMethod: 'credit_card',
                cardDetails: {
                    number: cardNumber,
                    expiry: cardExpiry,
                    cvv: cardCvv,
                    name: cardName
                }
            })
        });

        if (!response.ok) {
            throw new Error('Payment failed');
        }

        const result = await response.json();
        console.log('Payment created:', result);

        // Capture payment (in a real implementation, you might do this after product delivery)
        const captureResponse = await fetch('/api/payments/capture', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                paymentId: payment.paymentId,
                amount: payment.amount
            })
        });

        if (!captureResponse.ok) {
            throw new Error('Payment capture failed');
        }

        const captureResult = await captureResponse.json();
        console.log('Payment captured:', captureResult);

        // Redirect to success page
        window.location.href = `/api/callback?paymentId=${payment.paymentId}&status=success`;

    } catch (error) {
        console.error('Payment error:', error);
        document.getElementById('pay-button').disabled = false;

        // Redirect to failure page
        window.location.href = `/api/callback?paymentId=${paymentId}&status=failed`;
    }
});

// Handle cancel button
document.getElementById('cancel-button').addEventListener('click', async () => {
    try {
        // Cancel payment
        const response = await fetch('/api/payments/cancel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                paymentId,
                reason: 'Customer canceled'
            })
        });

        if (!response.ok) {
            throw new Error('Cancel failed');
        }

        // Redirect to cancel page
        window.location.href = `/api/callback?paymentId=${paymentId}&status=canceled`;

    } catch (error) {
        console.error('Cancel error:', error);
        alert('Failed to cancel payment. Please try again.');
    }
});

// Initialize page
fetchPaymentDetails();