const User = require('../models/User');

const AuthController = {
  // ensure the template always receives arrays for messages/errors
  loginForm(req, res) {
    res.render('login', {
      messages: req.flash('success') || [],
      errors: req.flash('error') || []
    });
  },

  registerForm(req, res) {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0], user: req.session.user });
  },

  register(req, res) {
    const { username, email, password, address, contact, role } = req.body;
    if (!username || !email || !password) {
      req.flash('error', 'Username, email, and password are required');
      req.flash('formData', req.body);
      return res.redirect('/register');
    }
    if (password.length < 6) {
      req.flash('error', 'Password should be at least 6 characters');
      req.flash('formData', req.body);
      return res.redirect('/register');
    }
    User.create({ username, email, password, address, contact, role: role || 'user' }, (err) => {
      if (err) {
        req.flash('error', err.message || 'Failed to register');
        req.flash('formData', req.body);
        return res.redirect('/register');
      }
      res.redirect('/login');
    });
  },

  login(req, res) {
    const { email, password } = req.body;
    if (!email || !password) {
      req.flash('error', 'Email and password are required');
      return res.redirect('/login');
    }
    User.verify(email, password, (err, user) => {
      if (err) {
        req.flash('error', err.message || 'Login error');
        return res.redirect('/login');
      }
      if (!user) {
        req.flash('error', 'Invalid credentials');
        return res.redirect('/login');
      }
      req.session.user = user;
      res.redirect('/');
    });
  },

  logout(req, res) {
    req.session.destroy(() => {
      res.redirect('/');
    });
  }
};

module.exports = AuthController;
