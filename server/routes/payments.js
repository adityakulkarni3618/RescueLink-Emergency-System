const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { verifyToken } = require('../middleware/auth');
const { Incident, AuditLog } = require('../utils/db');

// Initialize Razorpay Client
const rzpKeyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_mockKeyId12345';
const rzpKeySecret = process.env.RAZORPAY_KEY_SECRET || 'mockKeySecret1234567890';

const rzp = new Razorpay({
  key_id: rzpKeyId,
  key_secret: rzpKeySecret
});

const isMock = rzpKeyId.startsWith('rzp_test_mock');

/**
 * @route POST /api/payments/create-order
 * @desc Create a Razorpay Order
 */
router.post('/create-order', verifyToken(), async (req, res) => {
  const { amount, currency, ambulanceId } = req.body;
  if (!amount) {
    return res.status(400).json({ error: 'Amount is required' });
  }

  const orderAmount = Math.round(amount * 100); // Razorpay expects amount in paise (or cents)

  try {
    let order;
    if (isMock) {
      // Simulate Razorpay Order creation in Mock Mode
      console.log(`[RAZORPAY MOCK] Creating Order for amount: ${orderAmount} ${currency || 'INR'}`);
      order = {
        id: `order_mock_${Date.now()}`,
        amount: orderAmount,
        currency: currency || 'INR',
        receipt: `receipt_${Date.now()}`,
        status: 'created'
      };
    } else {
      order = await rzp.orders.create({
        amount: orderAmount,
        currency: currency || 'INR',
        receipt: `receipt_${Date.now()}`
      });
    }

    return res.json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      key: rzpKeyId
    });
  } catch (err) {
    console.error('[PAYMENTS API] Error creating Razorpay order:', err.message);
    return res.status(500).json({ error: 'Failed to create payment order' });
  }
});

/**
 * @route POST /api/payments/verify
 * @desc Verify Razorpay Payment Signature
 */
router.post('/verify', verifyToken(), async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, ambulanceId } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Payment verification parameters are missing' });
  }

  try {
    let isValid = false;

    if (isMock) {
      // Direct pass in mock mode
      console.log(`[RAZORPAY MOCK] Verifying signature for order ${razorpay_order_id}`);
      isValid = true;
    } else {
      const hmac = crypto.createHmac('sha256', rzpKeySecret);
      hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
      const generatedSignature = hmac.digest('hex');
      isValid = generatedSignature === razorpay_signature;
    }

    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Signature verification failed' });
    }

    // Find latest active incident or create one mapping this payment
    // Update payment status in Incident DB
    try {
      const incident = await Incident.findOne({
        where: {
          razorpay_order_id: razorpay_order_id
        }
      });

      if (incident) {
        incident.payment_status = 'paid';
        await incident.save();
      } else {
        // Create an incident mapping this payment if not matched (e.g. direct marketplace booking)
        await Incident.create({
          status: 'completed',
          payment_status: 'paid',
          razorpay_order_id,
          notes: `Marketplace booking payment success. Payment ID: ${razorpay_payment_id}`,
          pickup_address: 'Direct Booking'
        });
      }

      await AuditLog.create({
        user_id: req.user.id,
        action: 'PAYMENT_VERIFIED',
        resource: 'Incident',
        resource_id: razorpay_order_id,
        ip_address: req.ip || req.connection.remoteAddress,
        details: { razorpay_payment_id, amount: req.body.amount }
      });
    } catch (dbErr) {
      console.warn('[PAYMENTS API] DB Log failed but payment is valid:', dbErr.message);
    }

    return res.json({ success: true, message: 'Payment verified successfully' });
  } catch (err) {
    console.error('[PAYMENTS API] Error verifying payment:', err.message);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

module.exports = router;
