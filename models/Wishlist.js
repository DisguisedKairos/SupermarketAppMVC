const db = require('../db');

const Wishlist = {
  add(userId, productId, callback) {
    const sql = 'INSERT IGNORE INTO wishlist (userId, productId) VALUES (?, ?)';
    db.query(sql, [userId, productId], callback);
  },

  remove(userId, productId, callback) {
    const sql = 'DELETE FROM wishlist WHERE userId = ? AND productId = ?';
    db.query(sql, [userId, productId], callback);
  },

  listByUser(userId, callback) {
    const sql = `
      SELECT w.productId,
             p.productName,
             p.price,
             p.quantity,
             p.category,
             p.image
      FROM wishlist w
      JOIN products p ON p.id = w.productId
      WHERE w.userId = ?
      ORDER BY p.productName ASC
    `;
    db.query(sql, [userId], (err, results) => {
      if (err) return callback(err);
      callback(null, results || []);
    });
  },

  getProductIdsByUser(userId, callback) {
    const sql = 'SELECT productId FROM wishlist WHERE userId = ?';
    db.query(sql, [userId], (err, results) => {
      if (err) return callback(err);
      const ids = (results || []).map(r => r.productId);
      callback(null, ids);
    });
  }
};

module.exports = Wishlist;
