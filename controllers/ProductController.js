const Product = require('../models/Product');

const ProductController = {
// Inventory for admins
inventory(req, res) {
  const sort = req.query.sort || 'id';
  const dir = req.query.dir || 'desc';
  const search = req.query.q || '';
  const inStockOnly = req.query.inStock === '1';
  const category = req.query.category || 'all';

  Product.getAll({ sortBy: sort, sortDir: dir, search, inStockOnly, category }, (err, products) => {
    if (err) return res.status(500).send(err.message || 'DB error');

    Product.getCategories((err2, categories) => {
      if (err2) categories = [];

      const lowStockThreshold = 5;
      const lowStockCount = (products || []).filter((p) => {
        const qty = parseInt(p.quantity, 10) || 0;
        return qty > 0 && qty <= lowStockThreshold;
      }).length;

      res.render('inventory', {
        products,
        categories,
        user: req.session.user,
        sort,
        dir,
        search,
        inStockOnly,
        category,
        lowStockThreshold,
        lowStockCount
      });
    });
  });
},

  // Shopping page for customers with filters/sorts/categories
  shopping(req, res) {
    const search = req.query.q || '';
    const category = req.query.category || 'all';
    const inStockOnly = req.query.inStock === '1';
    const minPrice = req.query.minPrice || '';
    const maxPrice = req.query.maxPrice || '';
    const sort = req.query.sort || 'productName';
    const dir = req.query.dir || 'asc';

    Product.getAll({
      search,
      category,
      inStockOnly,
      minPrice: minPrice !== '' ? parseFloat(minPrice) : '',
      maxPrice: maxPrice !== '' ? parseFloat(maxPrice) : '',
      sortBy: sort,
      sortDir: dir
    }, (err, products) => {
      if (err) return res.status(500).send(err.message || 'DB error');

      Product.getCategories((err2, categories) => {
        if (err2) categories = [];

        const user = req.session.user;
        const renderWithWishlist = (wishlistProductIds) => {
          res.render('shopping', {
            products,
            categories,
            user,
            search,
            category,
            inStockOnly,
            minPrice,
            maxPrice,
            sort,
            dir,
            wishlistProductIds: wishlistProductIds || [],
            messages: req.flash('error') || []
          });
        };

        if (!user) {
          return renderWithWishlist([]);
        }

        const Wishlist = require('../models/Wishlist');
        Wishlist.getProductIdsByUser(user.id, (wErr, ids) => {
          if (wErr) {
            console.error(wErr);
            return renderWithWishlist([]);
          }
          renderWithWishlist(ids);
        });
      });
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
    Product.getCategories((err, categories) => {
      if (err) categories = [];
      res.render('addProduct', {
        user: req.session.user,
        categories,
        messages: req.flash('error') || []
      });
    });
  },

  add(req, res) {
    const image = req.file ? req.file.filename : '';
    let { name, category, quantity, price } = req.body;

    name = typeof name === 'string' ? name.trim() : '';
    category = typeof category === 'string' ? category.trim() : 'General';
    const qty = parseInt(quantity, 10);
    const pr = parseFloat(price);

    if (!name || Number.isNaN(qty) || qty < 0 || Number.isNaN(pr) || pr < 0) {
      req.flash('error', 'Please enter a valid name, non-negative quantity, and non-negative price');
      return res.redirect('/addProduct');
    }

    Product.add({ productName: name, category, quantity: qty, price: pr, image }, (err) => {
      if (err) return res.status(500).send(err.message || 'DB error');
      res.redirect('/inventory');
    });
  },

  editForm(req, res) {
    Product.getById(req.params.id, (err, product) => {
      if (err) return res.status(500).send(err.message || 'DB error');
      if (!product) return res.status(404).send('Product not found');

      Product.getCategories((err2, categories) => {
        if (err2) categories = [];
        res.render('editProduct', {
          product,
          user: req.session.user,
          categories,
          messages: req.flash('error') || []
        });
      });
    });
  },

  update(req, res) {
    const id = parseInt(req.params.id, 10);
    let { name, category, quantity, price } = req.body;

    name = typeof name === 'string' ? name.trim() : '';
    category = typeof category === 'string' ? category.trim() : 'General';
    const qty = parseInt(quantity, 10);
    const pr = parseFloat(price);

    if (!name || Number.isNaN(qty) || qty < 0 || Number.isNaN(pr) || pr < 0) {
      req.flash('error', 'Please enter a valid name, non-negative quantity, and non-negative price');
      return res.redirect(`/editProduct/${id}`);
    }

    let image = req.body.currentImage || '';
    if (req.file) image = req.file.filename;

    Product.update(id, { productName: name, category, quantity: qty, price: pr, image }, (err, result) => {
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
