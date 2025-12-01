const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
require('dotenv').config();

const app = express();

// Ensure DB connection on startup
require('./db');

// Controllers
const ProductController = require('./controllers/ProductController');
const AuthController = require('./controllers/AuthController');
const CartController = require('./controllers/CartController');
const WishlistController = require('./controllers/WishlistController');
const InvoiceController = require('./controllers/InvoiceController');
const Cart = require('./models/Cart');

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'supermarket_secret',
  resave: false,
  saveUninitialized: false
}));
app.use(flash());

// Multer for product image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'images')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Auth guards
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

// Global locals: user + cart count for navbar badge
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.cartCount = 0;

  if (req.session.user) {
    Cart.countItems(req.session.user.id, (err, count) => {
      if (!err) res.locals.cartCount = count;
      next();
    });
  } else {
    next();
  }
});

// Routes
app.get('/', (req, res) => res.render('index', {
  messages: req.flash('success') || [],
  errors: req.flash('error') || []
}));

// Auth routes
app.get('/login', AuthController.loginForm);
app.post('/login', AuthController.login);
app.get('/register', AuthController.registerForm);
app.post('/register', AuthController.register);
app.get('/logout', AuthController.logout);

// Shopping/customer routes
app.get('/shopping', checkAuthenticated, ProductController.shopping);
app.get('/product/:id', checkAuthenticated, ProductController.view);

// Admin inventory routes
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