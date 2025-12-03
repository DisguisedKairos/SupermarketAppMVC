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


  listUsers(req, res) {
    User.listAll((err, users) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error loading users");
      }
      res.render('users', {
        user: req.session.user,
        users
      });
    });
  },


  editUserForm(req, res) {
    const id = req.params.id;
    User.findById(id, (err, userRecord) => {
      if (err || !userRecord) {
        console.error(err);
        return res.status(404).send("User not found");
      }
      res.render('editUser', {
        user: req.session.user,
        editUser: userRecord
      });
    });
  },


  updateUser(req, res) {
    const id = req.params.id;
    const { role } = req.body;
    const safeRole = role === 'admin' ? 'admin' : 'user';
    User.updateRole(id, safeRole, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Could not update user role");
      }
      res.redirect('/admin/users');
    });
  },


  viewUserHistory(req, res) {
    const userId = req.params.id;
    const loggedUser = req.session.user;

    // Only admin allowed (additional safety; routes already use checkAdmin)
    if (!loggedUser || loggedUser.role !== 'admin') {
      return res.status(403).send('Forbidden');
    }

    // Lazy-load Invoice model to avoid circular requires at top
    const Invoice = require('../models/Invoice');

    Invoice.findByUserId(userId, (err, invoices) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Could not load purchase history for this user');
        return res.redirect('/admin/users');
      }

      // Render same history view but pass a flag / target user id
      res.render('history', {
        user: loggedUser,
        invoices,
        errors: req.flash('error') || [],
        messages: req.flash('success') || [],
        viewedUserId: userId
      });
    });
  },

  deleteUser(req, res) {
    const id = req.params.id;
    const loggedUser = req.session.user;

    if (!loggedUser || loggedUser.role !== 'admin') {
      return res.status(403).send('Forbidden');
    }

    // Prevent admin from deleting their own account via this page (optional safety)
    if (parseInt(id, 10) === loggedUser.id) {
      req.flash('error', 'You cannot delete your own admin account here.');
      return res.redirect('/admin/users');
    }

    User.deleteById(id, (err) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Could not delete user account');
      } else {
        req.flash('success', 'User account deleted successfully');
      }
      res.redirect('/admin/users');
    });
  },

  logout(req, res) {
    req.session.destroy(() => res.redirect('/login'));
  }
};

module.exports = AuthController;
