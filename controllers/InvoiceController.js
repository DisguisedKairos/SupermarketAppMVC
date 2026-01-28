const Invoice = require('../models/Invoice');
const Cart = require('../models/Cart');
const User = require('../models/User');

const InvoiceController = {
  // POST /checkout -> go to payment page
  checkout(req, res) {
    return res.redirect('/payment');
  },

  // GET /payment -> choose payment method + summary
  paymentForm(req, res) {
    const user = req.session.user;
    Cart.getItemsByUser(user.id, (err, items) => {
      if (err) {
        req.flash('error', 'Could not load cart');
        return res.redirect('/cart');
      }
      if (!items || items.length === 0) {
        req.flash('error', 'Your cart is empty.');
        return res.redirect('/cart');
      }

      let subtotal = 0;
      items.forEach(i => subtotal += i.price * i.quantity);
      subtotal = parseFloat(subtotal.toFixed(2));
      const tax = 0;
      const totalAmount = parseFloat((subtotal + tax).toFixed(2));

      User.getWalletBalance(user.id, (errW, walletBalance) => {
        if (!errW) {
          req.session.user.walletBalance = walletBalance;
        }

        res.render('payment', {
          user: req.session.user,
          cart: items,
          subtotal,
          tax,
          totalAmount,
          walletBalance: walletBalance || 0,
          selectedMethod: req.session.paymentMethod || '',
          errors: req.flash('error') || []
        });
      });
    });
  },

  // POST /payment -> validate method, create invoice, show invoice
  processPayment(req, res) {
    const user = req.session.user;
    const method = (req.body.paymentMethod || '').trim();

    const allowedMethods = ['Stripe', 'Cash', 'PayPal', 'NETSQR', 'EWallet'];
    if (!allowedMethods.includes(method)) {
      req.flash('error', 'Please choose a valid payment method.');
      return res.redirect('/payment');
    }

    // For offline methods, we treat payment as immediate
    const isImmediate = ['Cash'].includes(method);

    if (isImmediate) {
      req.session.paymentMethod = method;

      return Invoice.createFromCart(user.id, method, (err, data) => {
        if (err) {
          req.flash('error', err.message || 'Could not create invoice');
          return res.redirect('/cart');
        }

        // Convert DECIMAL strings to numbers for safe toFixed() in EJS
        data.header.subtotal = parseFloat(data.header.subtotal) || 0;
        data.header.tax = parseFloat(data.header.tax) || 0;
        data.header.totalAmount = parseFloat(data.header.totalAmount) || 0;
        data.items = (data.items || []).map((it) => ({
          ...it,
          price: parseFloat(it.price) || 0,
          quantity: parseInt(it.quantity, 10) || 0
        }));

        return res.render('invoice', {
          user,
          header: data.header,
          items: data.items,
          paymentMethod: method
        });
      });
    }

    if (method === 'EWallet') {
      Cart.getItemsByUser(user.id, (errC, items) => {
        if (errC) {
          req.flash('error', 'Could not load cart.');
          return res.redirect('/payment');
        }
        let subtotal = 0;
        (items || []).forEach(i => subtotal += (parseFloat(i.price) || 0) * (parseInt(i.quantity, 10) || 0));
        const totalAmount = parseFloat(subtotal.toFixed(2));

        User.getWalletBalance(user.id, (errW, balance) => {
          if (errW) {
            req.flash('error', 'Could not load wallet balance.');
            return res.redirect('/payment');
          }
          if (balance < totalAmount) {
            req.flash('error', 'Insufficient wallet balance.');
            return res.redirect('/payment');
          }

          Invoice.createFromCart(user.id, 'EWallet', (errInv, paidData) => {
            if (errInv) {
              req.flash('error', errInv.message || 'Could not complete wallet payment.');
              return res.redirect('/payment');
            }

            User.adjustWalletBalance(user.id, -totalAmount, (errAdj, newBalance) => {
              if (errAdj) {
                console.error('Wallet deduction failed:', errAdj.message);
              } else {
                req.session.user.walletBalance = newBalance;
              }

              paidData.header.subtotal = parseFloat(paidData.header.subtotal) || 0;
              paidData.header.tax = parseFloat(paidData.header.tax) || 0;
              paidData.header.totalAmount = parseFloat(paidData.header.totalAmount) || 0;
              paidData.items = (paidData.items || []).map((it) => ({
                ...it,
                price: parseFloat(it.price) || 0,
                quantity: parseInt(it.quantity, 10) || 0
              }));

              return res.render('invoice', {
                user,
                header: paidData.header,
                items: paidData.items,
                paymentMethod: 'EWallet'
              });
            });
          });
        });
      });
      return;
    }

    // Online methods (PayPal / NETS QR): create a PENDING invoice first
    Invoice.createPendingFromCart(user.id, method, async (err, data) => {
      if (err) {
        req.flash('error', err.message || 'Could not start checkout');
        return res.redirect('/cart');
      }

      const invoiceId = data.header.id;

      try {
        if (method === 'PayPal') {
          // JS SDK flow (slides): render a page with PayPal Buttons.
          // The button will call /api/paypal/create-order and /api/paypal/capture-order.
          return res.render('paypal_checkout', {
            user,
            invoiceId,
            totalAmount: parseFloat(data.header.totalAmount) || 0,
            paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
          });
        }

        if (method === 'Stripe') {
          const stripe = require('../services/stripe');
          const amount = parseFloat(data.header.totalAmount) || 0;

          const session = await stripe.createCheckoutSession({
            amount,
            invoiceId,
            userId: user.id,
          });

          if (!session || !session.id || !session.url) {
            throw new Error('Stripe did not return a valid checkout session.');
          }

          return Invoice.updateProviderMeta(
            { invoiceId, userId: user.id, provider: 'STRIPE', providerRef: session.id },
            (errUp) => {
              if (errUp) console.error('Failed to store Stripe meta:', errUp.message);
              return res.redirect(session.url);
            }
          );
        }

        if (method === 'NETSQR') {
          const crypto = require('crypto');
          const nets = require('../services/nets');

          // Use a static txn id if configured (helps match Postman testing).
          const staticTxnId = (process.env.NETS_TXN_ID || '').trim();
          const txnId = staticTxnId || `sandbox_nets|m|${crypto.randomUUID()}`;
          const amount = parseFloat(data.header.totalAmount) || 0;

          const qr = await nets.requestQr({
            amount: amount.toFixed(2),
            txnId,
            notifyMobile: 0,
          });

          if (!qr.qrCodeDataUrl || !qr.txnRetrievalRef) {
            throw new Error('NETS did not return a valid QR code / transaction reference.');
          }

          // Store txn_retrieval_ref as providerRef for SSE reconciliation
          return Invoice.updateProviderMeta(
            { invoiceId, userId: user.id, provider: 'NETSQR', providerRef: qr.txnRetrievalRef },
            (errUp) => {
              if (errUp) console.error('Failed to store NETS meta:', errUp.message);
              return res.render('netsQr', {
                title: 'NETS QR Payment',
                user,
                invoiceId,
                totalAmount: amount,
                qrCodeUrl: qr.qrCodeDataUrl,
                txnRetrievalRef: qr.txnRetrievalRef,
                apiKey: process.env.NETS_API_KEY || process.env.API_KEY || '',
                projectId: process.env.NETS_PROJECT_ID || process.env.PROJECT_ID || '',
                courseInitId: (() => { try { return require('../course_init_id').courseInitId || ''; } catch(_) { return ''; } })(),
                fullNetsResponse: qr.raw || {},
              });
            }
          );
        }

        // Fallback
        req.flash('error', 'Unsupported payment method.');
        return res.redirect('/payment');
      } catch (e) {
        console.error('Payment init error:', e);
        req.flash('error', e.message || 'Could not start online payment.');
        return res.redirect('/payment');
      }
    });
  },

  // GET /payment/retry/:invoiceId -> retry payment for existing invoice
  async retryPayment(req, res) {
    const user = req.session.user;
    const invoiceId = parseInt(req.params.invoiceId, 10);
    if (!user || Number.isNaN(invoiceId)) {
      req.flash('error', 'Invalid invoice id.');
      return res.redirect('/history');
    }

    Invoice.getById(invoiceId, user.id, async (err, data) => {
      if (err || !data || !data.header) {
        req.flash('error', err?.message || 'Invoice not found.');
        return res.redirect('/history');
      }

      const header = data.header;
      const method = header.paymentMethod || '';
      const status = header.status || '';
      const onlineMethods = ['PayPal', 'Stripe', 'NETSQR'];
      const blockedStatuses = ['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'];

      if (!onlineMethods.includes(method)) {
        req.flash('error', 'Only online payments can be retried.');
        return res.redirect(`/invoice/${invoiceId}`);
      }
      if (blockedStatuses.includes(status)) {
        req.flash('error', 'This invoice cannot be retried.');
        return res.redirect(`/invoice/${invoiceId}`);
      }

      Invoice.resetPendingPayment({ invoiceId, userId: user.id }, async (errReset) => {
        if (errReset) {
          req.flash('error', errReset.message || 'Could not restart payment.');
          return res.redirect(`/invoice/${invoiceId}`);
        }

        try {
          if (method === 'PayPal') {
            return res.render('paypal_checkout', {
              user,
              invoiceId,
              totalAmount: parseFloat(header.totalAmount) || 0,
              paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
            });
          }

          if (method === 'Stripe') {
            const stripe = require('../services/stripe');
            const amount = parseFloat(header.totalAmount) || 0;
            const session = await stripe.createCheckoutSession({
              amount,
              invoiceId,
              userId: user.id,
            });

            if (!session || !session.id || !session.url) {
              throw new Error('Stripe did not return a valid checkout session.');
            }

            return Invoice.updateProviderMeta(
              { invoiceId, userId: user.id, provider: 'STRIPE', providerRef: session.id },
              (errUp) => {
                if (errUp) console.error('Failed to store Stripe meta:', errUp.message);
                return res.redirect(session.url);
              }
            );
          }

          if (method === 'NETSQR') {
            const crypto = require('crypto');
            const nets = require('../services/nets');
            const staticTxnId = (process.env.NETS_TXN_ID || '').trim();
            const txnId = staticTxnId || `sandbox_nets|m|${crypto.randomUUID()}`;
            const amount = parseFloat(header.totalAmount) || 0;

            const qr = await nets.requestQr({
              amount: amount.toFixed(2),
              txnId,
              notifyMobile: 0,
            });

            if (!qr.qrCodeDataUrl || !qr.txnRetrievalRef) {
              throw new Error('NETS did not return a valid QR code / transaction reference.');
            }

            return Invoice.updateProviderMeta(
              { invoiceId, userId: user.id, provider: 'NETSQR', providerRef: qr.txnRetrievalRef },
              (errUp) => {
                if (errUp) console.error('Failed to store NETS meta:', errUp.message);
                return res.render('netsQr', {
                  title: 'NETS QR Payment',
                  user,
                  invoiceId,
                  totalAmount: amount,
                  qrCodeUrl: qr.qrCodeDataUrl,
                  txnRetrievalRef: qr.txnRetrievalRef,
                  apiKey: process.env.NETS_API_KEY || process.env.API_KEY || '',
                  projectId: process.env.NETS_PROJECT_ID || process.env.PROJECT_ID || '',
                  courseInitId: (() => { try { return require('../course_init_id').courseInitId || ''; } catch(_) { return ''; } })(),
                  fullNetsResponse: qr.raw || {},
                });
              }
            );
          }

          req.flash('error', 'Unsupported payment method.');
          return res.redirect(`/invoice/${invoiceId}`);
        } catch (e) {
          console.error('Retry payment error:', e);
          req.flash('error', e.message || 'Could not restart payment.');
          return res.redirect(`/invoice/${invoiceId}`);
        }
      });
    });
  },

  // GET /invoice/:id
  view(req, res) {
    const user = req.session.user;
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      req.flash('error', 'Invalid invoice ID');
      return res.redirect('/');
    }

    Invoice.getById(id, user.id, (err, invoice) => {
      if (err) {
        req.flash('error', err.message || 'Could not load invoice');
        return res.redirect('/');
      }

      // Convert DECIMAL strings to numbers for safe toFixed() in EJS
      invoice.header.subtotal = parseFloat(invoice.header.subtotal) || 0;
      invoice.header.tax = parseFloat(invoice.header.tax) || 0;
      invoice.header.totalAmount = parseFloat(invoice.header.totalAmount) || 0;
      invoice.header.refundedAmount = parseFloat(invoice.header.refundedAmount) || 0;
      invoice.items = (invoice.items || []).map(it => ({
        ...it,
        price: parseFloat(it.price) || 0,
        quantity: parseInt(it.quantity, 10) || 0
      }));

      res.render('invoice', {
        user,
        header: invoice.header,
        items: invoice.items,
        paymentMethod: invoice.header.paymentMethod || req.session.paymentMethod || '',
        statusHistory: invoice.history || [],
        refunds: invoice.refunds || []
      });
    });
  }

  ,

  /**
   * Slides flow: PayPal JS SDK calls these endpoints.
   * POST /api/paypal/create-order
   * POST /api/paypal/capture-order
   */
  async paypalApiCreateOrder(req, res) {
    const user = req.session.user;
    const invoiceId = parseInt(req.body.invoiceId, 10);

    if (!user) return res.status(401).json({ error: 'Not logged in' });
    if (Number.isNaN(invoiceId)) return res.status(400).json({ error: 'Invalid invoiceId' });

    Invoice.getById(invoiceId, user.id, async (err, inv) => {
      if (err) return res.status(404).json({ error: err.message || 'Invoice not found' });
      if (inv.header.status !== 'PENDING_PAYMENT' || inv.header.paymentMethod !== 'PayPal') {
        return res.status(400).json({ error: 'Invoice is not pending PayPal payment' });
      }

      try {
        const paypal = require('../services/paypal');
        const amount = (parseFloat(inv.header.totalAmount) || 0).toFixed(2);
        const order = await paypal.createOrder({ amount, referenceId: `INV-${invoiceId}` });

        if (!order || !order.id) return res.status(500).json({ error: 'No order id returned by PayPal' });

        return Invoice.updateProviderMeta(
          { invoiceId, userId: user.id, provider: 'PAYPAL', providerRef: order.id },
          () => res.json({ id: order.id })
        );
      } catch (e) {
        console.error('PayPal create-order error:', e);
        return res.status(500).json({ error: e.message || 'Failed to create PayPal order' });
      }
    });
  },

  async paypalApiCaptureOrder(req, res) {
    const user = req.session.user;
    const invoiceId = parseInt(req.body.invoiceId, 10);
    const orderId = req.body.orderId || req.body.orderID;

    if (!user) return res.status(401).json({ error: 'Not logged in' });
    if (Number.isNaN(invoiceId) || !orderId) return res.status(400).json({ error: 'Missing invoiceId/orderId' });

    try {
      const paypal = require('../services/paypal');
      const capture = await paypal.captureOrder(orderId);

      if (!capture || capture.status !== 'COMPLETED') {
        return res.status(400).json({ error: 'PayPal payment was not completed' });
      }

      Invoice.markPaid(
        { invoiceId, userId: user.id, paymentMethod: 'PayPal', provider: 'PAYPAL', providerRef: orderId },
        (err) => {
          if (err) return res.status(400).json({ error: err.message || 'Could not finalize payment' });
          return res.json({ ok: true });
        }
      );
    } catch (e) {
      console.error('PayPal capture-order error:', e);
      return res.status(500).json({ error: e.message || 'Failed to capture PayPal order' });
    }
  },

  // GET /history -> list invoices for the current logged-in user
  history(req, res) {
    const user = req.session.user;
    if (!user) {
      req.flash('error', 'Please log in to view purchase history');
      return res.redirect('/login');
    }

    Invoice.listByUser(user.id, (err, invoices) => {
      if (err) {
        req.flash('error', err.message || 'Could not load purchase history');
        return res.redirect('/');
      }

      res.render('history', {
        user,
        invoices,
        errors: req.flash('error') || [],
        messages: req.flash('success') || [],
        viewedUserId: null
      });
    });
  }

  ,

  // POST /paypal/create-order (optional API endpoint)
  async paypalCreateOrder(req, res) {
    const user = req.session.user;
    try {
      // Create a pending invoice (or reuse invoiceId from client)
      const paymentMethod = 'PayPal';
      Invoice.createPendingFromCart(user.id, paymentMethod, async (err, data) => {
        if (err) return res.status(400).json({ ok: false, error: err.message });

        const invoiceId = data.header.id;
        const paypal = require('../services/paypal');
        const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        const returnUrl = `${baseUrl}/paypal/return?invoiceId=${invoiceId}`;
        const cancelUrl = `${baseUrl}/paypal/cancel?invoiceId=${invoiceId}`;

        const order = await paypal.createOrder({
          amount: (parseFloat(data.header.totalAmount) || 0).toFixed(2),
          returnUrl,
          cancelUrl,
          referenceId: `INV-${invoiceId}`
        });

        const approval = (order.links || []).find((l) => l.rel === 'approve');
        if (!approval || !approval.href) {
          return res.status(500).json({ ok: false, error: 'No approval link returned by PayPal.' });
        }

        Invoice.updateProviderMeta(
          { invoiceId, userId: user.id, provider: 'PAYPAL', providerRef: order.id || null },
          () => res.json({ ok: true, invoiceId, approvalUrl: approval.href, orderId: order.id || null })
        );
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: e.message || 'Failed to create PayPal order' });
    }
  },

  // GET /paypal/return?invoiceId=123&token=PAYPAL_ORDER_ID
  async paypalReturn(req, res) {
    const user = req.session.user;
    const invoiceId = parseInt(req.query.invoiceId, 10);
    const orderId = req.query.token; // PayPal uses token as the order id on return

    if (Number.isNaN(invoiceId) || !orderId) {
      req.flash('error', 'Missing PayPal return parameters.');
      return res.redirect('/payment');
    }

    try {
      const paypal = require('../services/paypal');
      const capture = await paypal.captureOrder(orderId);

      // PayPal capture also includes purchase_units -> payments -> captures; we treat any COMPLETED status as success
      if (!capture || capture.status !== 'COMPLETED') {
        req.flash('error', 'PayPal payment was not completed.');
        return res.redirect('/payment');
      }

      Invoice.markPaid(
        { invoiceId, userId: user.id, paymentMethod: 'PayPal', provider: 'PAYPAL', providerRef: orderId },
        (err) => {
          if (err) {
            req.flash('error', err.message || 'Could not finalize payment.');
            return res.redirect('/payment');
          }
          req.flash('success', 'Payment successful!');
          return res.redirect(`/invoice/${invoiceId}`);
        }
      );
    } catch (e) {
      console.error('PayPal return error:', e);
      req.flash('error', e.message || 'PayPal capture failed.');
      return res.redirect('/payment');
    }
  },

  // GET /paypal/cancel?invoiceId=123
  paypalCancel(req, res) {
    const user = req.session.user;
    const invoiceId = parseInt(req.query.invoiceId, 10);
    if (!Number.isNaN(invoiceId)) {
      Invoice.markCancelled({ invoiceId, userId: user.id, reason: 'User cancelled PayPal checkout' }, () => {});
    }
    req.flash('error', 'PayPal payment cancelled.');
    return res.redirect('/payment');
  },

  // GET /stripe/success?session_id=cs_test_...
  async stripeSuccess(req, res) {
    const user = req.session.user;
    const sessionId = req.query.session_id;
    if (!sessionId) {
      req.flash('error', 'Missing Stripe session id.');
      return res.redirect('/payment');
    }

    try {
      const stripe = require('../services/stripe');
      const session = await stripe.retrieveCheckoutSession(sessionId);

      if (!session || session.payment_status !== 'paid') {
        req.flash('error', 'Stripe payment is not completed.');
        return res.redirect('/payment');
      }

      Invoice.findByProviderRef('STRIPE', sessionId, (err, row) => {
        if (err || !row) {
          req.flash('error', 'Stripe payment was received but invoice was not found.');
          return res.redirect('/payment');
        }
        if (row.userId !== user.id) {
          req.flash('error', 'Stripe invoice user mismatch.');
          return res.redirect('/payment');
        }

        Invoice.markPaid(
          { invoiceId: row.id, userId: user.id, paymentMethod: 'Stripe', provider: 'STRIPE', providerRef: sessionId },
          (markErr) => {
            if (markErr) {
              req.flash('error', markErr.message || 'Could not finalize Stripe payment.');
              return res.redirect('/payment');
            }
            req.flash('success', 'Payment successful!');
            return res.redirect(`/invoice/${row.id}`);
          }
        );
      });
    } catch (e) {
      console.error('Stripe success error:', e);
      req.flash('error', e.message || 'Stripe verification failed.');
      return res.redirect('/payment');
    }
  },

  // GET /stripe/cancel?invoiceId=123
  stripeCancel(req, res) {
    const user = req.session.user;
    const invoiceId = parseInt(req.query.invoiceId, 10);
    if (!Number.isNaN(invoiceId)) {
      Invoice.markCancelled({ invoiceId, userId: user.id, reason: 'User cancelled Stripe checkout' }, () => {});
    }
    req.flash('error', 'Stripe payment cancelled.');
    return res.redirect('/payment');
  },

  /**
   * Slides flow: SSE endpoint that repeatedly calls NETS "query" API every 5 seconds
   * and pushes results to the browser via EventSource.
   *
   * GET /sse/payment-status/:txnRetrievalRef
   */
  netsSsePaymentStatus(req, res) {
    const user = req.session.user;
    const txnRetrievalRef = req.params.txnRetrievalRef;
    if (!user) return res.status(401).end();
    if (!txnRetrievalRef) return res.status(400).end();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const nets = require('../services/nets');
    const startedAt = Date.now();
    const MAX_MS = 5 * 60 * 1000; // 5 minutes

    const send = (obj) => {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    let interval = null;
    let closed = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (interval) clearInterval(interval);
      try { res.end(); } catch (_) {}
    };

    req.on('close', cleanup);

    const pollOnce = async () => {
      try {
        const elapsed = Date.now() - startedAt;
        if (elapsed > MAX_MS) {
          send({ fail: true, reason: 'timeout' });
          return cleanup();
        }

        const q = await nets.queryTxn({ txnRetrievalRef, frontendTimeoutStatus: 0 });
        const responseCode = q.responseCode;
        const txnStatus = q.txnStatus;

        // Success condition from slides: response_code == "00" and txn_status == 1
        const success = String(responseCode) === '00' && Number(txnStatus) === 1;
        if (!success) {
          send({ pending: true, responseCode, txnStatus });
          return;
        }

        // Find the invoice that we created for this NETS txn
        Invoice.findByProviderRef('NETSQR', txnRetrievalRef, (err, row) => {
          if (err) {
            send({ success: true, butNoInvoice: true });
            return cleanup();
          }
          if (row.userId !== user.id) {
            send({ fail: true, reason: 'invoice_user_mismatch' });
            return cleanup();
          }

          // Finalize invoice (deduct stock + clear cart)
          Invoice.markPaid(
            {
              invoiceId: row.id,
              userId: user.id,
              paymentMethod: 'NETSQR',
              provider: 'NETSQR',
              providerRef: txnRetrievalRef,
            },
            (markErr) => {
              if (markErr) {
                send({ fail: true, reason: markErr.message || 'could_not_finalize' });
                return cleanup();
              }
              send({ success: true, invoiceId: row.id });
              return cleanup();
            }
          );
        });
      } catch (e) {
        // Keep polling on transient errors; also stream the error for debugging.
        send({ pending: true, error: e.message || 'query_failed' });
      }
    };

    // Immediate first poll + then every 5 seconds
    pollOnce();
    interval = setInterval(pollOnce, 5000);
  },

  // GET /netsqr/fail/:invoiceId
  netsQrFailPage(req, res) {
    const user = req.session.user;
    const invoiceId = parseInt(req.params.invoiceId, 10);
    if (Number.isNaN(invoiceId)) return res.redirect('/payment');
    return res.render('netsTxnFailStatus', {
      user,
      invoiceId,
      message: 'Transaction failed or timed out.'
    });
  },

  // GET /netsqr/pay/:invoiceId
  netsQrPayPage(req, res) {
    const user = req.session.user;
    const invoiceId = parseInt(req.params.invoiceId, 10);
    if (Number.isNaN(invoiceId)) {
      req.flash('error', 'Invalid invoice id');
      return res.redirect('/payment');
    }

    Invoice.getById(invoiceId, user.id, (err, invoice) => {
      if (err) {
        req.flash('error', err.message || 'Invoice not found');
        return res.redirect('/payment');
      }

      const sessionQr = (req.session.netsqr || {})[invoiceId];
      if (!sessionQr || !sessionQr.qrCodeDataUrl) {
        req.flash('error', 'QR code not found in session. Please restart payment.');
        return res.redirect('/payment');
      }

      res.render('netsqr_pay', {
        user,
        invoiceId,
        totalAmount: parseFloat(invoice.header.totalAmount) || 0,
        qrCodeDataUrl: sessionQr.qrCodeDataUrl
      });
    });
  },

  // GET /netsqr/status/:invoiceId (polled by frontend)
  netsQrStatus(req, res) {
    const user = req.session.user;
    const invoiceId = parseInt(req.params.invoiceId, 10);
    if (Number.isNaN(invoiceId)) return res.status(400).json({ ok: false, error: 'Invalid invoice id' });

    Invoice.getStatus(invoiceId, user.id, (err, row) => {
      if (err) return res.status(404).json({ ok: false, error: err.message });
      return res.json({ ok: true, status: row.status, invoiceId: row.id });
    });
  },

  /**
   * POST /netsqr/webhook
   * NETS server-to-server callback.
   *
   * IMPORTANT:
   * - Configure your NETS Developer Portal webhook URL to point here:
   *   https://<your-ngrok-domain>/netsqr/webhook
   * - Add signature validation here if your portal provides HMAC headers.
   */
  netsQrWebhook(req, res) {
    try {
      const payload = req.body || {};
      // Try to extract invoice id from txn_id like: INV-<invoiceId>-<uuid>
      const txnId = payload.txn_id || payload.txnId || payload.merchant_txn_id || '';
      const m = typeof txnId === 'string' ? txnId.match(/INV-(\d+)-/i) : null;
      const invoiceId = m ? parseInt(m[1], 10) : null;

      // Determine success
      const responseCode = payload.response_code || payload.responseCode;
      const txnStatus = payload.txn_status || payload.txnStatus;
      const networkStatus = payload.network_status || payload.networkStatus;
      const success =
        payload.success === true ||
        responseCode === '00' ||
        txnStatus === 1 ||
        String(txnStatus).toUpperCase() === 'SUCCESS' ||
        String(txnStatus).toUpperCase() === 'COMPLETED' ||
        networkStatus === 0;

      if (!invoiceId) {
        // Acknowledge so NETS doesn't keep retrying, but log for debugging.
        console.warn('NETS webhook: could not parse invoiceId from txn_id', txnId);
        return res.status(200).json({ ok: true });
      }

      // NOTE: We don't know userId in webhook context, so we finalize by updating invoice without user check.
      // To keep the model safe, we'll finalize with a dedicated query here (server-trusted).
      const db = require('../db');

      if (!success) {
        db.query("UPDATE invoice SET status='FAILED' WHERE id = ?", [invoiceId], () => {});
        return res.status(200).json({ ok: true });
      }

      // Mark paid (stock deduction + cart clearing requires userId, so we finalize invoice status only here).
      // Recommended: map invoiceId -> userId and call Invoice.markPaid. We do a safe lookup first.
      db.query('SELECT userId FROM invoice WHERE id = ?', [invoiceId], (err, rows) => {
        if (err || !rows || !rows[0]) return res.status(200).json({ ok: true });
        const userId = rows[0].userId;

        Invoice.markPaid(
          { invoiceId, userId, paymentMethod: 'NETSQR', provider: 'NETSQR', providerRef: payload.txn_retrieval_ref || txnId || null },
          () => res.status(200).json({ ok: true })
        );
      });
    } catch (e) {
      console.error('NETS webhook error:', e);
      return res.status(200).json({ ok: true });
    }
  },

  // POST /admin/invoices/:id/void
  adminVoid(req, res) {
    const admin = req.session.user;
    const invoiceId = parseInt(req.params.id, 10);
    const reason = (req.body.reason || '').trim();
    const targetUserId = parseInt(req.body.userId, 10);

    if (!admin || admin.role !== 'admin') return res.status(403).send('Forbidden');
    if (Number.isNaN(invoiceId)) {
      req.flash('error', 'Invalid invoice id');
      if (!Number.isNaN(targetUserId)) {
        return res.redirect(`/admin/users/${targetUserId}/history`);
      }
      return res.redirect('/admin/users');
    }

    Invoice.markVoided({ invoiceId, adminUserId: admin.id, reason }, (err) => {
      if (err) {
        req.flash('error', err.message || 'Could not void invoice');
        return res.redirect('/admin/users');
      }
      req.flash('success', 'Invoice voided.');
      return res.redirect('/admin/users');
    });
  },

  // POST /admin/invoices/:id/refund
  adminRefund(req, res) {
    const admin = req.session.user;
    const invoiceId = parseInt(req.params.id, 10);
    const amount = (req.body.amount || '').trim();
    const reason = (req.body.reason || '').trim();
    const targetUserId = parseInt(req.body.userId, 10);

    if (!admin || admin.role !== 'admin') return res.status(403).send('Forbidden');
    if (Number.isNaN(invoiceId)) {
      req.flash('error', 'Invalid invoice id');
      if (!Number.isNaN(targetUserId)) {
        return res.redirect(`/admin/users/${targetUserId}/history`);
      }
      return res.redirect('/admin/users');
    }

    Invoice.refund({ invoiceId, adminUserId: admin.id, amount, reason }, (err) => {
      if (err) {
        req.flash('error', err.message || 'Could not refund invoice');
        return res.redirect('/admin/users');
      }
      req.flash('success', 'Refund recorded.');
      return res.redirect('/admin/users');
    });
  },

};

module.exports = InvoiceController;
