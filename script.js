
// Wix & Razorpay Configuration
const WIX_BASE_URL = 'https://www.ritinjali.org';

const RAZORPAY_CONFIG = {
    keyId: 'rzp_live_TbnBUVllLD3B5v', // Ritinjali Live Key ID
    orgName: 'Ritinjali',
    logoUrl: 'https://static.wixstatic.com/media/6d82ba_1ad64fe642dd4ef0bfd45e991823ed28~mv2.jpg/v1/fill/w_66,h_102,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/1706865449124_edited.jpg',
    themeColor: '#177A47',
    currency: 'INR',
};

async function callWixFunction(actionName, payload) {
    const prefixes = ['/_functions/', '/_functions-dev/'];
    let lastError = null;

    const baseUrls = (window.location.origin && window.location.origin.includes('ritinjali.org'))
        ? ['', WIX_BASE_URL]
        : [WIX_BASE_URL];

    for (const base of baseUrls) {
        for (const prefix of prefixes) {
            const url = base + prefix + actionName;
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (res.status === 404) {
                    continue;
                }

                const data = await res.json().catch(function () { return {}; });
                if (!res.ok) {
                    throw new Error(data && data.error ? data.error : ('Server error: ' + res.status));
                }
                return data;
            } catch (err) {
                lastError = err;
            }
        }
    }
    throw lastError || new Error('Unable to connect to payment backend.');
}

// Amount Impact Descriptions
const impactDescriptions = {
    '1000': 'Supports the cost of stationery for 10 students at our learning centres for one month',
    '2500': 'Supports nutritious lunches for one child or youth for one month',
    '5000': 'Supports foundational learning for one child',
    '8000': 'Supports a high school dropout complete Grade 10 or 12',
    'other': 'Supports education, livelihoods, and community development programmes'
};

// State variables
let currentBaseAmount = 2500;
let currentAmount = 2500;
let currentDonationType = 'onetime';
let pendingRetryFn = null;

// Step Elements
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const successStep = document.getElementById('successStep');
const failedStep = document.getElementById('failedStep');

function showStep(target) {
    [step1, step2, successStep, failedStep].forEach(s => {
        if (s) s.style.display = 'none';
    });
    if (target) {
        target.style.display = 'flex';
    }
    autoResize();
}

// Frequency Toggle
const typeButtons = document.querySelectorAll('.btn-donation-type');
typeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        typeButtons.forEach(b => {
            b.classList.remove('active');
            b.style.backgroundColor = 'var(--white)';
            b.style.color = 'var(--green)';
        });
        btn.classList.add('active');
        btn.style.backgroundColor = 'var(--green)';
        btn.style.color = 'var(--white)';
        currentDonationType = btn.textContent.trim().toLowerCase().includes('monthly') ? 'monthly' : 'onetime';
    });
});

// Amount Selection
const amountButtons = document.querySelectorAll('.btn-amount');
const metaText = document.getElementById('amountMetaText');
const otherWrap = document.getElementById('otherInputWrap');
const otherInput = document.getElementById('input-other-amount');

amountButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        amountButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const amountKey = btn.getAttribute('data-amount') || btn.textContent.trim().replace('₹', '').toLowerCase();

        if (amountKey === 'other' || amountKey === 'others') {
            if (metaText) metaText.style.display = 'none';
            if (otherWrap) otherWrap.style.display = 'flex';
            if (otherInput) otherInput.focus();
            currentBaseAmount = Number(otherInput.value) || 0;
        } else {
            if (otherWrap) otherWrap.style.display = 'none';
            if (metaText) {
                metaText.style.display = 'block';
                metaText.textContent = impactDescriptions[amountKey] || '';
            }
            currentBaseAmount = Number(amountKey) || 2500;
        }
        autoResize();
    });
});

if (otherInput) {
    otherInput.addEventListener('input', () => {
        currentBaseAmount = Number(otherInput.value) || 0;
    });
}

// Foreign Citizen Redirection
const FOREIGN_DONATION_URL = "https://mygoodness.benevity.org/community/cause/356-5813729896034_4037/donate";
const foreignRadio = document.getElementById('citizenForeign');

if (foreignRadio) {
    foreignRadio.addEventListener('change', function () {
        if (this.checked) {
            if (window.top !== window.self) {
                window.open(FOREIGN_DONATION_URL, '_blank');
            } else {
                window.location.href = FOREIGN_DONATION_URL;
            }
        }
    });
}

// Step 1 -> Step 2
const donateButton = document.getElementById('donateButton');
const backBtn = document.getElementById('backBtn');

if (donateButton) {
    donateButton.addEventListener('click', () => {
        const activeBtn = document.querySelector('.btn-amount.active');
        const isOther = activeBtn && (activeBtn.getAttribute('data-amount') === 'other' || activeBtn.textContent.includes('Other'));

        if (isOther) {
            const val = otherInput ? Number(otherInput.value.trim()) : 0;
            if (!val || val <= 0) {
                alert('Please enter a valid contribution amount.');
                if (otherInput) otherInput.focus();
                return;
            }
            currentBaseAmount = val;
        }

        const coverChargesEl = document.getElementById('coverCharges');
        const coverChecked = coverChargesEl ? coverChargesEl.checked : false;
        currentAmount = coverChecked ? Math.round(currentBaseAmount * 1.03) : currentBaseAmount;

        showStep(step2);
    });
}

if (backBtn) {
    backBtn.addEventListener('click', () => {
        showStep(step1);
    });
}

// PAN Auto-Uppercase
const panInput = document.getElementById('pan');
if (panInput) {
    panInput.addEventListener('input', function () {
        this.value = this.value.toUpperCase();
    });
}

// Step 2 Form Submission & Validation
const indianDonorForm = document.getElementById('indianDonorForm');
const paymentProceedBtn = document.getElementById('paymentProceedBtn');
const step2Error = document.getElementById('step2Error');

if (indianDonorForm) {
    indianDonorForm.addEventListener('submit', function (e) {
        e.preventDefault();
        handlePaymentSubmit();
    });
}

function handlePaymentSubmit() {
    if (step2Error) {
        step2Error.style.display = 'none';
        step2Error.textContent = '';
    }

    const pan = panInput ? panInput.value.trim().toUpperCase() : '';
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
        showError('Please enter a valid 10-digit Indian PAN (e.g. ABCDE1234F).', panInput);
        return;
    }

    const nameInput = document.getElementById('fullName');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
        showError('Please enter your full name as needed on the receipt.', nameInput);
        return;
    }

    const addressInput = document.getElementById('address');
    const address = addressInput ? addressInput.value.trim() : '';
    if (!address) {
        showError('Please enter your address.', addressInput);
        return;
    }

    const cityInput = document.getElementById('city');
    const city = cityInput ? cityInput.value.trim() : '';
    if (!city) {
        showError('Please enter your city.', cityInput);
        return;
    }

    const stateInput = document.getElementById('state');
    const state = stateInput ? stateInput.value.trim() : '';
    if (!state) {
        showError('Please enter your state / province.', stateInput);
        return;
    }

    const phoneInput = document.getElementById('phone');
    const phone = phoneInput ? phoneInput.value.trim() : '';
    if (!phone || phone.replace(/\D/g, '').length < 10) {
        showError('Please enter a valid 10-digit phone number.', phoneInput);
        return;
    }

    const emailInput = document.getElementById('email');
    const email = emailInput ? emailInput.value.trim() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError('Please enter a valid email address.', emailInput);
        return;
    }

    const termsCheck = document.getElementById('termsCheck');
    if (termsCheck && !termsCheck.checked) {
        showError('Please agree to the Terms and Conditions and Privacy Policy.');
        return;
    }

    const donorInfo = {
        name: name,
        email: email,
        phone: phone,
        pan: pan,
        address: address,
        city: city,
        state: state,
        country: document.getElementById('country') ? document.getElementById('country').value : 'India',
        anonymous: document.getElementById('anonymousDonor') ? document.getElementById('anonymousDonor').checked : false,
        coverCharges: document.getElementById('coverCharges') ? document.getElementById('coverCharges').checked : false,
        donationType: currentDonationType,
        citizenType: 'indian',
    };

    // Detect mobile & iframe context
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    const isInIframe = (window.self !== window.top);

    let checkoutWindow = null;
    if (isInIframe) {
        try {
            if (isMobile) {
                // Phone: Open in full window/tab so Razorpay occupies the entire screen
                checkoutWindow = window.open('about:blank', '_blank');
            } else {
                // Website/Desktop: Open centered secure modal window
                const w = 480;
                const h = 700;
                const left = Math.max(0, Math.round((window.screen.width - w) / 2));
                const top = Math.max(0, Math.round((window.screen.height - h) / 2));
                checkoutWindow = window.open('about:blank', 'RazorpayModal', `width=${w},height=${h},top=${top},left=${left},status=no,menubar=no,toolbar=no,resizable=yes,scrollbars=yes`);
            }

            if (checkoutWindow && checkoutWindow.document) {
                checkoutWindow.document.write(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Connecting to Gateway - ${RAZORPAY_CONFIG.orgName}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&display=swap" rel="stylesheet">
    <script src="https://checkout.razorpay.com/v1/checkout.js"><\/script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: #ffffff;
            color: #1f2937;
            text-align: center;
            padding: 24px;
        }
        .spinner {
            width: 48px;
            height: 48px;
            border: 4px solid #e5e7eb;
            border-top-color: #177A47;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin-bottom: 20px;
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .title {
            font-size: 20px;
            font-weight: 700;
            color: #177A47;
            margin-bottom: 8px;
        }
        .desc {
            font-size: 14px;
            color: #6b7280;
            line-height: 1.4;
            max-width: 320px;
        }
        .amt-tag {
            margin-top: 16px;
            background: #e8f5e9;
            color: #177A47;
            padding: 6px 16px;
            border-radius: 20px;
            font-weight: 700;
            font-size: 16px;
        }
    </style>
</head>
<body>
    <div class="spinner"></div>
    <div class="title">Opening Secure Gateway...</div>
    <div class="desc">Please wait while we connect to Razorpay securely.</div>
    <div class="amt-tag">₹${Number(currentAmount).toLocaleString('en-IN')}</div>
</body>
</html>
                        `);
                checkoutWindow.document.close();
            }
        } catch (e) {
            console.warn('Could not launch checkout window, falling back inline:', e);
            checkoutWindow = null;
        }
    }

    openRazorpay(currentAmount, donorInfo, paymentProceedBtn, step2Error, checkoutWindow);
}

function showError(msg, focusEl) {
    if (step2Error) {
        step2Error.textContent = msg;
        step2Error.style.display = 'block';
    } else {
        alert(msg);
    }
    if (focusEl) focusEl.focus();
    autoResize();
}

// Razorpay Checkout Integration
function openRazorpay(amountINR, donorInfo, submitBtn, errorEl, checkoutWindow) {
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'OPENING GATEWAY...';
    }
    if (errorEl) {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
    }

    function launchCheckout(orderId) {
        if (!orderId) {
            if (checkoutWindow && !checkoutWindow.closed) {
                try { checkoutWindow.close(); } catch (e) { }
            }
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'PROCEED TO PAYMENT';
            }
            if (errorEl) {
                errorEl.textContent = 'Cannot launch checkout: Missing server Order ID.';
                errorEl.style.display = 'block';
            }
            return;
        }

        const targetWindow = (checkoutWindow && !checkoutWindow.closed) ? checkoutWindow : window;

        function startRazorpayInstance() {
            const options = {
                key: RAZORPAY_CONFIG.keyId,
                amount: amountINR * 100, // paise
                currency: RAZORPAY_CONFIG.currency,
                name: RAZORPAY_CONFIG.orgName,
                image: RAZORPAY_CONFIG.logoUrl,
                order_id: orderId,
                description: 'Donation to ' + RAZORPAY_CONFIG.orgName,
                prefill: {
                    name: donorInfo.name || '',
                    email: donorInfo.email || '',
                    contact: donorInfo.phone || '',
                },
                notes: {
                    pan: donorInfo.pan || '',
                    citizen_type: donorInfo.citizenType || 'indian',
                    anonymous: donorInfo.anonymous || false,
                    address: donorInfo.address || '',
                },
                config: {
                    display: {
                        blocks: {
                            banks: { name: 'Pay via UPI / QR', instruments: [{ method: 'upi' }] },
                        },
                        sequence: ['block.banks'],
                        preferences: { show_default_blocks: true },
                    }
                },
                theme: { color: RAZORPAY_CONFIG.themeColor },
                handler: function (response) {
                    if (checkoutWindow && !checkoutWindow.closed) {
                        try {
                            checkoutWindow.document.body.innerHTML = `
                                        <div style="font-family:'Outfit',sans-serif;text-align:center;padding:30px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;">
                                            <div style="color:#177A47;font-size:24px;font-weight:700;margin-bottom:8px;">✓ Payment Successful</div>
                                            <p style="color:#6b7280;font-size:14px;">Updating donation receipt...</p>
                                        </div>
                                    `;
                            setTimeout(() => {
                                try { checkoutWindow.close(); } catch (e) { }
                            }, 1200);
                        } catch (e) { }
                    }

                    if (submitBtn) {
                        submitBtn.textContent = 'VERIFYING...';
                    }

                    callWixFunction('verifyPayment', {
                        orderId: response.razorpay_order_id,
                        paymentId: response.razorpay_payment_id,
                        signature: response.razorpay_signature,
                    })
                        .then(function (data) {
                            if (submitBtn) {
                                submitBtn.disabled = false;
                                submitBtn.textContent = 'PROCEED TO PAYMENT';
                            }
                            if (data && data.valid) {
                                renderSuccessScreen({
                                    amount: amountINR,
                                    paymentId: response.razorpay_payment_id,
                                    orderId: response.razorpay_order_id,
                                    donorName: donorInfo.name,
                                    email: donorInfo.email,
                                });
                                showStep(successStep);
                            } else {
                                renderFailedScreen(
                                    'Payment signature verification failed. If your account was debited, your bank will automatically refund it within 3-5 working days.',
                                    function () { showStep(step2); }
                                );
                                showStep(failedStep);
                            }
                        })
                        .catch(function (err) {
                            if (submitBtn) {
                                submitBtn.disabled = false;
                                submitBtn.textContent = 'PROCEED TO PAYMENT';
                            }
                            renderFailedScreen(
                                'Verification error: ' + (err.message || 'Please contact support with Payment ID ' + (response.razorpay_payment_id || '')),
                                function () { showStep(step2); }
                            );
                            showStep(failedStep);
                        });
                },
                modal: {
                    ondismiss: function () {
                        if (checkoutWindow && !checkoutWindow.closed) {
                            try { checkoutWindow.close(); } catch (e) { }
                        }
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.textContent = 'PROCEED TO PAYMENT';
                        }
                    }
                }
            };

            if (typeof targetWindow.Razorpay === 'undefined') {
                const script = targetWindow.document.createElement('script');
                script.src = 'https://checkout.razorpay.com/v1/checkout.js';
                script.onload = () => {
                    const rzp = new targetWindow.Razorpay(options);
                    rzp.on('payment.failed', function (response) {
                        if (checkoutWindow && !checkoutWindow.closed) {
                            try { checkoutWindow.close(); } catch (e) { }
                        }
                        const reason = (response.error && response.error.description)
                            ? response.error.description
                            : 'Payment was declined by bank or failed.';
                        renderFailedScreen(reason, function () { openRazorpay(amountINR, donorInfo, submitBtn, errorEl); });
                        showStep(failedStep);
                    });
                    rzp.open();
                };
                script.onerror = () => {
                    if (checkoutWindow && !checkoutWindow.closed) {
                        try { checkoutWindow.close(); } catch (e) { }
                    }
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'PROCEED TO PAYMENT';
                    }
                    if (errorEl) {
                        errorEl.textContent = 'Could not load Razorpay SDK in checkout window.';
                        errorEl.style.display = 'block';
                    }
                };
                targetWindow.document.head.appendChild(script);
            } else {
                const rzp = new targetWindow.Razorpay(options);
                rzp.on('payment.failed', function (response) {
                    if (checkoutWindow && !checkoutWindow.closed) {
                        try { checkoutWindow.close(); } catch (e) { }
                    }
                    const reason = (response.error && response.error.description)
                        ? response.error.description
                        : 'Payment was declined by bank or failed.';
                    renderFailedScreen(reason, function () { openRazorpay(amountINR, donorInfo, submitBtn, errorEl); });
                    showStep(failedStep);
                });
                rzp.open();
            }
        }

        startRazorpayInstance();
    }

    callWixFunction('createOrder', {
        amount: amountINR,
        currency: RAZORPAY_CONFIG.currency,
        donor: donorInfo,
    })
        .then(function (data) {
            if (!data || !data.id) {
                throw new Error('No order ID returned by backend.');
            }
            launchCheckout(data.id);
        })
        .catch(function (err) {
            console.error('[createOrder Error]', err);
            if (checkoutWindow && !checkoutWindow.closed) {
                try { checkoutWindow.close(); } catch (e) { }
            }
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'PROCEED TO PAYMENT';
            }
            if (errorEl) {
                errorEl.textContent = 'Order error: ' + (err.message || 'Could not connect to payment backend.');
                errorEl.style.display = 'block';
            }
            renderFailedScreen(
                'Could not initiate order: ' + (err.message || 'Please check your connection and try again.'),
                function () { openRazorpay(amountINR, donorInfo, submitBtn, errorEl); }
            );
            showStep(failedStep);
        });
}

function renderSuccessScreen(info) {
    const amtEl = document.getElementById("successAmount");
    if (amtEl) amtEl.textContent = "₹" + Number(info.amount || 0).toLocaleString("en-IN");

    const payIdEl = document.getElementById("successPaymentId");
    if (payIdEl) payIdEl.textContent = info.paymentId || "—";

    const orderIdEl = document.getElementById("successOrderId");
    if (orderIdEl) orderIdEl.textContent = info.orderId || "—";

    const nameEl = document.getElementById("successDonorName");
    if (nameEl) nameEl.textContent = info.donorName || "Valued Supporter";

    const emailEl = document.getElementById("successDonorEmail");
    if (emailEl) emailEl.textContent = info.email || "your email";

    const dateEl = document.getElementById("successDate");
    if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    const whatsappBtn = document.getElementById("shareWhatsappBtn");
    if (whatsappBtn) {
        const text = encodeURIComponent(
            `I just supported ${RAZORPAY_CONFIG.orgName}! Join me in creating an impact: https://ritinjali.org/donate`
        );
        whatsappBtn.onclick = function () {
            window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
        };
    }

    const printBtn = document.getElementById("printReceiptBtn");
    if (printBtn) {
        printBtn.onclick = function () {
            window.print();
        };
    }
}

function renderFailedScreen(reason, retryFn) {
    const reasonEl = document.getElementById("failedReasonText");
    if (reasonEl) reasonEl.textContent = reason || "Payment transaction could not be authorized.";
    pendingRetryFn = retryFn || null;
}

const anotherBtn = document.getElementById('anotherBtn');
if (anotherBtn) {
    anotherBtn.addEventListener('click', function () {
        if (indianDonorForm) indianDonorForm.reset();
        showStep(step1);
    });
}

const retryPaymentBtn = document.getElementById('retryPaymentBtn');
if (retryPaymentBtn) {
    retryPaymentBtn.addEventListener('click', function () {
        if (typeof pendingRetryFn === 'function') {
            pendingRetryFn();
        } else {
            showStep(step2);
        }
    });
}

const changeDetailsBtn = document.getElementById('changeDetailsBtn');
if (changeDetailsBtn) {
    changeDetailsBtn.addEventListener('click', function () {
        showStep(step1);
    });
}

// Auto-resize iframe height to fit exact content
function autoResize() {
    const requiredHeight = Math.ceil(document.body.scrollHeight);
    try {
        if (window.frameElement) {
            window.frameElement.style.height = requiredHeight + 'px';
        }
    } catch (e) { }

    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'setIframeHeight', height: requiredHeight }, '*');
    }
}
document.querySelectorAll('.terms-link').forEach(link => {
    link.addEventListener('click', function (e) {
        e.stopPropagation();
    });
});

window.addEventListener('DOMContentLoaded', autoResize);
window.addEventListener('load', autoResize);
window.addEventListener('resize', autoResize);

if (window.ResizeObserver) {
    new ResizeObserver(autoResize).observe(document.body);
}
