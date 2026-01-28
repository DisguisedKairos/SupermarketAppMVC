// User model
const db = require('../db');

const User = {
  create({ username, email, password, address, contact, role }, callback) {
    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    db.query(sql, [username, email, password, address, contact, role || 'user'], (err, result) => {
      if (err) return callback(err);
      return callback(null, { insertId: result.insertId });
    });
  },

  findByEmail(email, callback) {
    const sql = 'SELECT id, username, email, address, contact, role, walletBalance, password FROM users WHERE email = ?';
    db.query(sql, [email], (err, results) => {
      if (err) return callback(err);
      return callback(null, results[0] || null);
    });
  },


  listAll(callback) {
    const sql = 'SELECT id, username, email, address, contact, role, walletBalance FROM users ORDER BY id DESC';
    db.query(sql, (err, results) => {
      if (err) return callback(err);
      return callback(null, results || []);
    });
  },

  findById(id, callback) {
    const sql = 'SELECT id, username, email, address, contact, role, walletBalance FROM users WHERE id = ?';
    db.query(sql, [id], (err, results) => {
      if (err) return callback(err);
      return callback(null, results[0] || null);
    });
  },


  deleteById(id, callback) {
    const sql = 'DELETE FROM users WHERE id = ?';
    db.query(sql, [id], (err, result) => {
      if (err) return callback(err);
      return callback(null, result);
    });
  },

  updateRole(id, role, callback) {
    const sql = 'UPDATE users SET role = ? WHERE id = ?';
    db.query(sql, [role, id], (err, result) => {
      if (err) return callback(err);
      return callback(null, result);
    });
  },

  verify(email, password, callback) {
    const sql = 'SELECT id, username, email, address, contact, role, walletBalance FROM users WHERE email = ? AND password = SHA1(?)';
    db.query(sql, [email, password], (err, results) => {
      if (err) return callback(err);
      return callback(null, results[0] || null);
    });
  },

  getWalletBalance(userId, callback) {
    const sql = 'SELECT walletBalance FROM users WHERE id = ?';
    db.query(sql, [userId], (err, results) => {
      if (err) return callback(err);
      const row = results && results[0] ? results[0] : { walletBalance: 0 };
      return callback(null, parseFloat(row.walletBalance) || 0);
    });
  },

  adjustWalletBalance(userId, delta, callback) {
    const sql = 'UPDATE users SET walletBalance = walletBalance + ? WHERE id = ?';
    db.query(sql, [delta, userId], (err) => {
      if (err) return callback(err);
      return User.getWalletBalance(userId, callback);
    });
  },
};

module.exports = User;
