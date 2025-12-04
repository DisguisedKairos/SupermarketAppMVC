const Invoice = require('../models/Invoice');
const Cart = require('../models/Cart');

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

      res.render('payment', {
        user,
        cart: items,
        subtotal,
        tax,
        totalAmount,
        selectedMethod: req.session.paymentMethod || '',
        errors: req.flash('error') || []
      });
    });
  },

  // POST /payment -> validate method, create invoice, show invoice
  processPayment(req, res) {
    const user = req.session.user;
    const method = (req.body.paymentMethod || '').trim();

    const allowedMethods = ['Card', 'PayNow', 'GrabPay', 'Cash'];
    if (!allowedMethods.includes(method)) {
      req.flash('error', 'Please choose a valid payment method.');
      return res.redirect('/payment');
    }

    req.session.paymentMethod = method;

    Invoice.createFromCart(user.id, (err, data) => {
      if (err) {
        req.flash('error', err.message || 'Could not create invoice');
        return res.redirect('/cart');
      }

      // Convert DECIMAL strings to numbers for safe toFixed() in EJS
      data.header.subtotal = parseFloat(data.header.subtotal) || 0;
      data.header.tax = parseFloat(data.header.tax) || 0;
      data.header.totalAmount = parseFloat(data.header.totalAmount) || 0;
      data.items = (data.items || []).map(it => ({
        ...it,
        price: parseFloat(it.price) || 0,
        quantity: parseInt(it.quantity, 10) || 0
      }));

      res.render('invoice', {
        user,
        header: data.header,
        items: data.items,
        paymentMethod: method
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
      invoice.items = (invoice.items || []).map(it => ({
        ...it,
        price: parseFloat(it.price) || 0,
        quantity: parseInt(it.quantity, 10) || 0
      }));

      res.render('invoice', {
        user,
        header: invoice.header,
        items: invoice.items,
        paymentMethod: req.session.paymentMethod || ''
      });
    });
  }

  ,

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

};

module.exports = InvoiceController;