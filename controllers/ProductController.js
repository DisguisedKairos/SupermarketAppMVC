const Product = require('../models/Product');

const ProductController = {
  // Inventory for admins
  inventory(req, res) {
    Product.getAll((err, products) => {
      if (err) return res.status(500).send(err.message || 'DB error');
      res.render('inventory', { products, user: req.session.user });
    });
  },

  // Public shopping page
  shopping(req, res) {
    Product.getAll((err, products) => {
      if (err) return res.status(500).send(err.message || 'DB error');
      res.render('shopping', { products, user: req.session.user });
    });
  },

  view(req, res) {
    Product.getById(req.params.id, (err, product) => {
      if (err) return res.status(500).send(err.message || 'DB error');
      if (!product) return res.status(404).send('Product not found');
      res.render('product', { product, user: req.session.user });
    });
  },

  addForm(req, res) {
    res.render('addProduct', { user: req.session.user, messages: req.flash('error') });
  },

  add(req, res) {
    const image = req.file ? req.file.filename : (req.body.image || '');
    const { name, quantity, price } = req.body;
    if (!name || !quantity || !price) {
      req.flash('error', 'Please fill in all required fields');
      return res.redirect('/addProduct');
    }
    Product.add({ productName: name, quantity, price, image }, (err) => {
      if (err) return res.status(500).send(err.message || 'DB error');
      res.redirect('/inventory');
    });
  },

  editForm(req, res) {
    Product.getById(req.params.id, (err, product) => {
      if (err) return res.status(500).send(err.message || 'DB error');
      if (!product) return res.status(404).send('Product not found');
      res.render('editProduct', { product, user: req.session.user });
    });
  },

  update(req, res) {
    const id = req.params.id;
    const { name, quantity, price } = req.body;
    let image = req.body.currentImage || '';
    if (req.file) image = req.file.filename;

    Product.update(id, { productName: name, quantity, price, image }, (err, result) => {
      if (err) return res.status(500).send(err.message || 'DB error');
      if (result.affectedRows === 0) return res.status(404).send('Product not found');
      res.redirect('/inventory');
    });
  },

  delete(req, res) {
    Product.delete(req.params.id, (err, result) => {
      if (err) return res.status(500).send(err.message || 'DB error');
      if (result.affectedRows === 0) return res.status(404).send('Product not found');
      res.redirect('/inventory');
    });
  }
};

module.exports = ProductController;
