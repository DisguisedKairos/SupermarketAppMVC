const Cart = require('../models/Cart');
const Product = require('../models/Product');

const CartController = {
  index(req, res) {
    const user = req.session.user;
    Cart.getItemsByUser(user.id, (err, items) => {
      if (err) return res.status(500).send(err.message || 'DB error');

      let total = 0;
      items.forEach(i => total += i.price * i.quantity);
      total = parseFloat(total.toFixed(2));

      res.render('cart', {
        cart: items,
        total,
        user,
        errors: req.flash('error') || [],
        success: req.flash('success') || []
      });
    });
  },

  add(req, res) {
    const user = req.session.user;
    const productId = parseInt(req.params.id, 10);
    const qty = parseInt(req.body.quantity, 10) || 1;

    if (Number.isNaN(productId) || qty <= 0) {
      req.flash('error', 'Invalid product or quantity');
      return res.redirect('/shopping');
    }

    Product.getById(productId, (err, product) => {
      if (err || !product) {
        req.flash('error', 'Product not found');
        return res.redirect('/shopping');
      }

      const stock = parseInt(product.quantity, 10) || 0;
      if (stock <= 0) {
        req.flash('error', 'Product is out of stock');
        return res.redirect('/shopping');
      }
      if (qty > stock) {
        req.flash('error', 'Quantity exceeds stock available');
        return res.redirect('/shopping');
      }

      Cart.addItem(user.id, productId, qty, (err2) => {
        if (err2) {
          req.flash('error', 'Could not add to cart');
          return res.redirect('/shopping');
        }
        req.flash('success', 'Added to cart');
        res.redirect('/shopping');
      });
    });
  },

  update(req, res) {
    const user = req.session.user;
    const cartId = parseInt(req.params.cartId, 10);
    const qty = parseInt(req.body.quantity, 10);

    if (Number.isNaN(cartId) || Number.isNaN(qty)) {
      req.flash('error', 'Invalid quantity');
      return res.redirect('/cart');
    }

    // Need to validate against stock
    Cart.getItemsByUser(user.id, (err, items) => {
      if (err) {
        req.flash('error', 'Database error');
        return res.redirect('/cart');
      }
      const item = items.find(i => i.cartId === cartId);
      if (!item) {
        req.flash('error', 'Cart item not found');
        return res.redirect('/cart');
      }
      Product.getById(item.productId, (err2, product) => {
        if (err2 || !product) {
          req.flash('error', 'Product not found');
          return res.redirect('/cart');
        }
        const stock = parseInt(product.quantity, 10) || 0;
        if (qty > stock) {
          req.flash('error', 'Quantity exceeds stock available');
          return res.redirect('/cart');
        }

        Cart.updateQuantity(cartId, user.id, qty, (err3) => {
          if (err3) req.flash('error', 'Could not update cart');
          else req.flash('success', 'Cart updated');
          res.redirect('/cart');
        });
      });
    });
  },

  remove(req, res) {
    const user = req.session.user;
    const cartId = parseInt(req.params.cartId, 10);
    if (Number.isNaN(cartId)) {
      req.flash('error', 'Invalid cart item');
      return res.redirect('/cart');
    }
    Cart.removeItem(cartId, user.id, (err) => {
      if (err) req.flash('error', 'Could not remove item');
      else req.flash('success', 'Item removed');
      res.redirect('/cart');
    });
  },

  clear(req, res) {
    const user = req.session.user;
    Cart.clear(user.id, (err) => {
      if (err) req.flash('error', 'Could not clear cart');
      else req.flash('success', 'Cart cleared');
      res.redirect('/cart');
    });
  }
};

module.exports = CartController;
