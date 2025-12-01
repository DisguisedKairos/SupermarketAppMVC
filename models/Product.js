// Product model with search/filter/sort + categories
const db = require('../db');

const Product = {
  /**
   * Get all products with optional filters:
   * options:
   *  - sortBy: 'id' | 'productName' | 'quantity' | 'price' | 'category'
   *  - sortDir: 'asc' | 'desc'
   *  - search: string to search in productName
   *  - category: string category name (omit or 'all' for all)
   *  - inStockOnly: boolean
   *  - minPrice: number
   *  - maxPrice: number
   *
   * Supports getAll(callback) OR getAll(options, callback)
   */
  getAll(options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    options = options || {};

    const allowedSort = ['id', 'productName', 'quantity', 'price', 'category'];
    const sortBy = allowedSort.includes(options.sortBy) ? options.sortBy : 'id';
    const sortDir = (options.sortDir && options.sortDir.toLowerCase() === 'asc') ? 'ASC' : 'DESC';

    const params = [];
    const whereClauses = [];

    if (options.search && options.search.trim() !== '') {
      whereClauses.push('productName LIKE ?');
      params.push('%' + options.search.trim() + '%');
    }

    if (options.category && options.category !== 'all') {
      whereClauses.push('category = ?');
      params.push(options.category);
    }

    if (options.inStockOnly) {
      whereClauses.push('quantity > 0');
    }

    if (options.minPrice !== undefined && options.minPrice !== null && options.minPrice !== '') {
      whereClauses.push('price >= ?');
      params.push(options.minPrice);
    }

    if (options.maxPrice !== undefined && options.maxPrice !== null && options.maxPrice !== '') {
      whereClauses.push('price <= ?');
      params.push(options.maxPrice);
    }

    let sql = 'SELECT id, productName, category, quantity, price, image FROM products';
    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }
    sql += ' ORDER BY ' + sortBy + ' ' + sortDir;

    db.query(sql, params, (err, results) => {
      if (err) return callback(err);
      return callback(null, results);
    });
  },

  getById(id, callback) {
    const sql = 'SELECT id, productName, category, quantity, price, image FROM products WHERE id = ?';
    db.query(sql, [id], (err, results) => {
      if (err) return callback(err);
      return callback(null, results[0] || null);
    });
  },

  getCategories(callback) {
    const sql = 'SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category <> "" ORDER BY category ASC';
    db.query(sql, (err, results) => {
      if (err) return callback(err);
      const cats = results.map(r => r.category);
      return callback(null, cats);
    });
  },

  add({ productName, category, quantity, price, image }, callback) {
    const sql = 'INSERT INTO products (productName, category, quantity, price, image) VALUES (?, ?, ?, ?, ?)';
    db.query(sql, [productName, category || 'General', quantity, price, image || null], (err, result) => {
      if (err) return callback(err);
      return callback(null, { insertId: result.insertId });
    });
  },

  update(id, { productName, category, quantity, price, image }, callback) {
    const sql = 'UPDATE products SET productName = ?, category = ?, quantity = ?, price = ?, image = ? WHERE id = ?';
    db.query(sql, [productName, category || 'General', quantity, price, image || null, id], (err, result) => {
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
