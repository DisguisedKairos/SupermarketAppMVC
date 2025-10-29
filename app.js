const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
require('dotenv').config();

const app = express();

// DB (ensures connection on startup)
require('./db');

// Controllers
const ProductController = require('./controllers/ProductController');
const AuthController = require('./controllers/AuthController');

// Multer uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/images'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// View engine & static
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));

// Sessions & flash (aligned with existing app behavior)
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 week
}));
app.use(flash());

// Auth middleware
const checkAuthenticated = (req, res, next) => {
  if (req.session.user) return next();
  req.flash('error', 'Please log in to view this resource');
  res.redirect('/login');
};
const checkAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') return next();
  req.flash('error', 'Admin access only');
  res.redirect('/');
};

// Routes
app.get('/', (req, res) => res.render('index', { user: req.session.user }));

// Auth
app.get('/login', AuthController.loginForm);
app.post('/login', AuthController.login);
app.get('/register', AuthController.registerForm);
app.post('/register', AuthController.register);
app.get('/logout', AuthController.logout);

// Products (public / shopper)
app.get('/shopping', ProductController.shopping);
app.get('/product/:id', ProductController.view);

// Inventory (admin)
app.get('/inventory', checkAuthenticated, checkAdmin, ProductController.inventory);
app.get('/addProduct', checkAuthenticated, checkAdmin, ProductController.addForm);
app.post('/addProduct', checkAuthenticated, checkAdmin, upload.single('image'), ProductController.add);
app.get('/editProduct/:id', checkAuthenticated, checkAdmin, ProductController.editForm);
app.post('/editProduct/:id', checkAuthenticated, checkAdmin, upload.single('image'), ProductController.update);
app.get('/deleteProduct/:id', checkAuthenticated, checkAdmin, ProductController.delete);

// Simple cart using session (minimal wiring for existing views)
app.get('/cart', (req, res) => {
  const cart = req.session.cart || [];
  res.render('cart', { cart, user: req.session.user });
});
app.get('/addToCart/:id', (req, res) => {
  const productId = parseInt(req.params.id || req.query.id, 10);
  const quantity = parseInt(req.query.qty || req.body?.quantity || '1', 10);
  if (!req.session.cart) req.session.cart = [];
  Product.getById(productId, (err, product) => {
    if (err || !product) return res.status(404).send('Product not found');
    const existing = req.session.cart.find(i => i.id === productId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      req.session.cart.push({
        id: product.id,
        productName: product.productName,
        price: product.price,
        quantity: quantity,
        image: product.image
      });
    }
    res.redirect('/cart');
  });
});

app.get('/removeFromCart/:id', (req, res) => {
  const productId = parseInt(req.params.id, 10);
  req.session.cart = (req.session.cart || []).filter(i => i.id !== productId);
  res.redirect('/cart');
});


// Route aliases to support older links using /updateProduct/:id
app.get('/updateProduct/:id', checkAuthenticated, checkAdmin, ProductController.editForm);
app.post('/updateProduct/:id', checkAuthenticated, checkAdmin, upload.single('image'), ProductController.update);




// Canonical cart routes (standardised)
app.get('/cart', (req, res) => {
  const cart = req.session.cart || [];
  res.render('cart', { cart, user: req.session.user });
});

app.post('/add-to-cart/:id', (req, res) => {
  const productId = parseInt(req.params.id, 10);
  const quantity = parseInt(req.body?.quantity || req.query.qty || '1', 10);
  if (!req.session.cart) req.session.cart = [];
  const Product = require('./models/Product');
  Product.getById(productId, (err, product) => {
    if (err || !product) return res.status(404).send('Product not found');
    const existing = req.session.cart.find(i => i.id === productId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      req.session.cart.push({
        id: product.id,
        productName: product.productName,
        price: product.price,
        quantity: quantity,
        image: product.image
      });
    }
    res.redirect('/cart');
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
