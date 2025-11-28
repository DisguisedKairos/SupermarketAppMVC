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
    const sql = 'SELECT id, username, email, address, contact, role, password FROM users WHERE email = ?';
    db.query(sql, [email], (err, results) => {
      if (err) return callback(err);
      return callback(null, results[0] || null);
    });
  },

  verify(email, password, callback) {
    const sql = 'SELECT id, username, email, address, contact, role FROM users WHERE email = ? AND password = SHA1(?)';
    db.query(sql, [email, password], (err, results) => {
      if (err) return callback(err);
      return callback(null, results[0] || null);
    });
  }
};

module.exports = User;
