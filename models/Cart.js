// Cart model: stores items per user in `cart` table
const db = require('../db');

const Cart = {
  getItemsByUser(userId, callback) {
    const sql = `
      SELECT
        c.id AS cartId,
        c.productId,
        c.quantity,
        p.productName,
        p.price,
        p.image,
        p.category
      FROM cart c
      JOIN products p ON c.productId = p.id
      WHERE c.userId = ?
      ORDER BY c.id DESC
    `;
    db.query(sql, [userId], (err, results) => {
      if (err) return callback(err);
      // Convert DECIMAL strings to numbers
      const items = (results || []).map(r => ({
        ...r,
        price: parseFloat(r.price) || 0,
        quantity: parseInt(r.quantity, 10) || 0
      }));
      return callback(null, items);
    });
  },

  addItem(userId, productId, quantity, callback) {
    // If item exists, update quantity; else insert
    const checkSql = 'SELECT id, quantity FROM cart WHERE userId = ? AND productId = ?';
    db.query(checkSql, [userId, productId], (err, results) => {
      if (err) return callback(err);

      if (results && results.length > 0) {
        const row = results[0];
        const newQty = (parseInt(row.quantity, 10) || 0) + quantity;
        const updateSql = 'UPDATE cart SET quantity = ? WHERE id = ?';
        db.query(updateSql, [newQty, row.id], (err2) => {
          if (err2) return callback(err2);
          return callback(null);
        });
      } else {
        const insertSql = 'INSERT INTO cart (userId, productId, quantity) VALUES (?, ?, ?)';
        db.query(insertSql, [userId, productId, quantity], (err2) => {
          if (err2) return callback(err2);
          return callback(null);
        });
      }
    });
  },

  updateQuantity(cartId, userId, quantity, callback) {
    if (quantity <= 0) return this.removeItem(cartId, userId, callback);
    const sql = 'UPDATE cart SET quantity = ? WHERE id = ? AND userId = ?';
    db.query(sql, [quantity, cartId, userId], (err, result) => {
      if (err) return callback(err);
      return callback(null, { affectedRows: result.affectedRows });
    });
  },

  removeItem(cartId, userId, callback) {
    const sql = 'DELETE FROM cart WHERE id = ? AND userId = ?';
    db.query(sql, [cartId, userId], (err, result) => {
      if (err) return callback(err);
      return callback(null, { affectedRows: result.affectedRows });
    });
  },

  clear(userId, callback) {
    const sql = 'DELETE FROM cart WHERE userId = ?';
    db.query(sql, [userId], (err) => {
      if (err) return callback(err);
      return callback(null);
    });
  },

  countItems(userId, callback) {
    const sql = 'SELECT COALESCE(SUM(quantity), 0) AS total FROM cart WHERE userId = ?';
    db.query(sql, [userId], (err, results) => {
      if (err) return callback(err);
      const total = results && results[0] ? parseInt(results[0].total, 10) || 0 : 0;
      return callback(null, total);
    });
  }
};

module.exports = Cart;
