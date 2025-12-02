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
// Admin user management
app.get('/admin/users', checkAuthenticated, checkAdmin, AuthController.listUsers);
app.get('/admin/users/:id/edit', checkAuthenticated, checkAdmin, AuthController.editUserForm);
app.post('/admin/users/:id/edit', checkAuthenticated, checkAdmin, AuthController.updateUser);


// Wishlist routes
app.get('/wishlist', checkAuthenticated, WishlistController.list);
app.post('/wishlist/add/:id', checkAuthenticated, WishlistController.add);
app.post('/wishlist/remove/:id', checkAuthenticated, WishlistController.remove);

// Cart routes
app.get('/cart', checkAuthenticated, CartController.index);
app.post('/cart/add/:id', checkAuthenticated, CartController.add);
// backwards compatible add-to-cart
app.post('/add-to-cart/:id', checkAuthenticated, CartController.add);

app.post('/cart/update/:cartId', checkAuthenticated, CartController.update);
app.post('/cart/remove/:cartId', checkAuthenticated, CartController.remove);
app.post('/cart/clear', checkAuthenticated, CartController.clear);

// Checkout & payment & invoice
app.post('/checkout', checkAuthenticated, InvoiceController.checkout);
app.get('/payment', checkAuthenticated, InvoiceController.paymentForm);
app.post('/payment', checkAuthenticated, InvoiceController.processPayment);
app.get('/invoice/:id', checkAuthenticated, InvoiceController.view);
app.get('/history', checkAuthenticated, InvoiceController.history);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
app.get('/admin/users/:id/history', checkAuthenticated, checkAdmin, AuthController.viewUserHistory);

app.post('/admin/users/:id/delete', checkAuthenticated, checkAdmin, AuthController.deleteUser);
