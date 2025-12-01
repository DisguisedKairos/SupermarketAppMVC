const Wishlist = require('../models/Wishlist');

const WishlistController = {
  list(req, res) {
    const user = req.session.user;
    Wishlist.listByUser(user.id, (err, items) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Could not load wishlist');
        return res.redirect('/shopping');
      }
      res.render('wishlist', { items, user });
    });
  },

  add(req, res) {
    const user = req.session.user;
    const productId = req.params.id;
    Wishlist.add(user.id, productId, (err) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Could not add to wishlist');
      } else {
        req.flash('success', 'Saved to wishlist');
      }
      const back = req.get('Referer') || '/shopping';
      res.redirect(back);
    });
  },

  remove(req, res) {
    const user = req.session.user;
    const productId = req.params.id;
    Wishlist.remove(user.id, productId, (err) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Could not remove from wishlist');
      } else {
        req.flash('success', 'Removed from wishlist');
      }
      const back = req.get('Referer') || '/wishlist';
      res.redirect(back);
    });
  }
};

module.exports = WishlistController;
