const User = require('../models/User');

const AuthController = {
  loginForm(req, res) {
    res.render('login', {
      messages: req.flash('success') || [],
      errors: req.flash('error') || [],
      user: req.session.user || null
    });
  },

  registerForm(req, res) {
    const formData = req.flash('formData')[0] || {};
    const errors = req.flash('error') || [];
    res.render('register', {
      errors,
      formData,
      user: req.session.user || null
    });
  },

  register(req, res) {
    const { username, email, password, address, contact } = req.body;
    const errors = [];

    const uname = (username || '').trim();
    const mail = (email || '').trim().toLowerCase();
    const pwd = password || '';
    const addr = (address || '').trim();
    const phone = (contact || '').trim();

    if (!uname) errors.push('Username is required');
    if (!mail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) errors.push('Valid email is required');
    if (!pwd || pwd.length < 6) errors.push('Password must be at least 6 characters');
    if (!addr) errors.push('Address is required');
    if (!phone) errors.push('Contact is required');

    if (errors.length) {
      req.flash('error', errors);
      req.flash('formData', { username: uname, email: mail, address: addr, contact: phone });
      return res.redirect('/register');
    }

    User.findByEmail(mail, (err, existing) => {
      if (err) {
        req.flash('error', 'Database error');
        return res.redirect('/register');
      }
      if (existing) {
        req.flash('error', 'Email already registered');
        req.flash('formData', { username: uname, email: mail, address: addr, contact: phone });
        return res.redirect('/register');
      }

      User.create({ username: uname, email: mail, password: pwd, address: addr, contact: phone, role: 'user' }, (err2) => {
        if (err2) {
          req.flash('error', 'Could not create account');
          return res.redirect('/register');
        }
        req.flash('success', 'Account created. Please log in.');
        res.redirect('/login');
      });
    });
  },

  login(req, res) {
    const { email, password } = req.body;
    const mail = (email || '').trim().toLowerCase();
    const pwd = password || '';

    if (!mail || !pwd) {
      req.flash('error', 'Email and password are required');
      return res.redirect('/login');
    }

    User.verify(mail, pwd, (err, user) => {
      if (err) {
        req.flash('error', 'Database error');
        return res.redirect('/login');
      }
      if (!user) {
        req.flash('error', 'Invalid email or password');
        return res.redirect('/login');
      }
      req.session.user = user;
      res.redirect('/');
    });
  },

  logout(req, res) {
    req.session.destroy(() => res.redirect('/login'));
  }
};

module.exports = AuthController;
