const API_URL = 'http://localhost:3000';
const API_KEY = '93a7fcb2-daf5-46ee-a00f-f6fd272fc522';

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const orderId = urlParams.get('orderId');
const amount = urlParams.get('amount');

// Update order summary
document.getElementById('order-id').textContent = `Order ID: ${orderId}`;
document.getElementById('order-amount').textContent = `Amount: $${(amount/100).toFixed(2)}`;

// Form validation
function validateCard() {
    const cardNumber = document.getElementById('card-number').value.replace(/\s/g, '');
    const expiry = document.getElementById('card-expiry').value;
    const cvv = document.getElementById('card-cvv').value;
    
    let isValid = true;
    
    // Card number validation
    if (!/^\d{16}$/.test(cardNumber)) {
        document.getElementById('card-number-error').textContent = 'Invalid card number';
        isValid = false;
    } else {
        document.getElementById('card-number-error').textContent = '';
    }
    
    // Expiry validation
    if (!/^\d{2}\/\d{2}$/.test(expiry)) {
        document.getElementById('card-expiry-error').textContent = 'Invalid format (MM/YY)';
        isValid = false;
    } else {
        document.getElementById('card-expiry-error').textContent = '';
    }
    
    // CVV validation
    if (!/^\d{3}$/.test(cvv)) {
        document.getElementById('card-cvv-error').textContent = 'Invalid CVV';
        isValid = false;
    } else {
        document.getElementById('card-cvv-error').textContent = '';
    }
    
    return isValid;
}

// Handle payment submission
document.getElementById('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!validateCard()) return;

    const paymentId = `pay_${Date.now()}`;
    
    try {
        // Create payment
        const createResponse = await fetch(`${API_URL}/api/payments/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY
            },
            body: JSON.stringify({
                paymentId,
                orderId,
                amount: Number(amount),
                cardDetails: {
                    number: document.getElementById('card-number').value.replace(/\s/g, ''),
                    expiry: document.getElementById('card-expiry').value,
                    cvv: document.getElementById('card-cvv').value,
                    name: document.getElementById('card-name').value
                }
            })
        });

        const paymentResult = await createResponse.json();

        if (paymentResult.status === 'created') {
            // Capture payment
            const captureResponse = await fetch(`${API_URL}/api/payments/capture`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': API_KEY
                },
                body: JSON.stringify({
                    paymentId,
                    amount: Number(amount)
                })
            });

            const captureResult = await captureResponse.json();

            if (captureResult.status === 'captured') {
                alert('Payment successful!');
                window.location.href = urlParams.get('successUrl') || '/';
            } else {
                throw new Error('Payment capture failed');
            }
        }
    } catch (error) {
        console.error('Payment error:', error);
        alert('Payment failed. Please try again.');
    }
});

// Handle cancel button
document.getElementById('cancel-button').addEventListener('click', () => {
    const cancelUrl = urlParams.get('cancelUrl') || '/';
    window.location.href = cancelUrl;
});

// Format card number with spaces
document.getElementById('card-number').addEventListener('input', (e) => {
    let value = e.target.value.replace(/\s/g, '');
    if (value.length > 16) value = value.substr(0, 16);
    e.target.value = value.replace(/(\d{4})/g, '$1 ').trim();
});

// Format expiry date
document.getElementById('card-expiry').addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 4) value = value.substr(0, 4);
    if (value.length > 2) {
        value = value.substr(0, 2) + '/' + value.substr(2);
    }
    e.target.value = value;
});

// Limit CVV to 3 digits
document.getElementById('card-cvv').addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 3) value = value.substr(0, 3);
    e.target.value = value;
});