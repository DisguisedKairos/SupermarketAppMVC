// Function-based Product model
const db = require('../db');

const Product = {
  getAll(callback) {
    const sql = 'SELECT id, productName, quantity, price, image FROM products ORDER BY id DESC';
    db.query(sql, (err, results) => {
      if (err) return callback(err);
      return callback(null, results);
    });
  },

  getById(id, callback) {
    const sql = 'SELECT id, productName, quantity, price, image FROM products WHERE id = ?';
    db.query(sql, [id], (err, results) => {
      if (err) return callback(err);
      return callback(null, results[0] || null);
    });
  },

  add({ productName, quantity, price, image }, callback) {
    const sql = 'INSERT INTO products (productName, quantity, price, image) VALUES (?, ?, ?, ?)';
    db.query(sql, [productName, quantity, price, image], (err, result) => {
      if (err) return callback(err);
      return callback(null, { insertId: result.insertId });
    });
  },

  update(id, { productName, quantity, price, image }, callback) {
    const sql = 'UPDATE products SET productName = ?, quantity = ?, price = ?, image = ? WHERE id = ?';
    db.query(sql, [productName, quantity, price, image, id], (err, result) => {
      if (err) return callback(err);
      return callback(null, { affectedRows: result.affectedRows, changedRows: result.changedRows });
    });
  },

  delete(id, callback) {
    const sql = 'DELETE FROM products WHERE id = ?';
    db.query(sql, [id], (err, result) => {
      if (err) return callback(err);
      return callback(null, { affectedRows: result.affectedRows });
    });
  }
};

module.exports = Product;
