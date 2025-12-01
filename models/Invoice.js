// Invoice model using `invoice` and `invoice_items` tables
const db = require('../db');

const Invoice = {
  /**
   * Create an invoice from the current user's cart.
   * - Validates that cart is not empty
   * - Validates that requested quantities do not exceed current product stock
   * - Inserts into `invoice` and `invoice_items`
   * - Deducts stock from `products.quantity`
   * - Clears the cart
   * - Returns header + items for rendering
   */
  createFromCart(userId, callback) {
    const cartSql = `
      SELECT
        c.productId,
        c.quantity,
        p.productName,
        p.price,
        p.quantity AS stockQty
      FROM cart c
      JOIN products p ON c.productId = p.id
      WHERE c.userId = ?
    `;

    db.query(cartSql, [userId], (err, items) => {
      if (err) return callback(err);
      if (!items || items.length === 0) {
        return callback(new Error('Your cart is empty.'));
      }

      // Validate against current stock to prevent overselling / negative stock
      const insufficient = (items || []).find((item) => {
        const cartQty = parseInt(item.quantity, 10) || 0;
        const stockQty = parseInt(item.stockQty, 10) || 0;
        return cartQty > stockQty;
      });

      if (insufficient) {
        const available = parseInt(insufficient.stockQty, 10) || 0;
        return callback(new Error(
          `Not enough stock for "${insufficient.productName}". Available: ${available}.`
        ));
      }

      // Calculate totals
      let subtotal = 0;
      items.forEach((item) => {
        subtotal += (parseFloat(item.price) || 0) * (parseInt(item.quantity, 10) || 0);
      });
      subtotal = parseFloat(subtotal.toFixed(2));
      const tax = 0; // set GST if required
      const total = parseFloat((subtotal + tax).toFixed(2));

      // Insert invoice header
      const invSql = 'INSERT INTO invoice (userId, subtotal, tax, totalAmount) VALUES (?, ?, ?, ?)';
      db.query(invSql, [userId, subtotal, tax, total], (err2, result) => {
        if (err2) return callback(err2);
        const invoiceId = result.insertId;

        // Insert invoice items
        const values = items.map((item) => [
          invoiceId,
          item.productId,
          item.productName,
          item.quantity,
          item.price
        ]);

        const itemsSql = 'INSERT INTO invoice_items (invoiceId, productId, productName, quantity, price) VALUES ?';
        db.query(itemsSql, [values], (err3) => {
          if (err3) return callback(err3);

          // Deduct stock for each purchased product
          const deductSql = 'UPDATE products SET quantity = quantity - ? WHERE id = ?';

          const updateNext = (index) => {
            if (index >= items.length) {
              // After stock is updated, clear the cart
              const clearSql = 'DELETE FROM cart WHERE userId = ?';
              db.query(clearSql, [userId], (err4) => {
                if (err4) return callback(err4);

                // Load fresh header for return
                const headerSql = 'SELECT id, userId, subtotal, tax, totalAmount, createdAt FROM invoice WHERE id = ?';
                db.query(headerSql, [invoiceId], (err5, rows) => {
                  if (err5) return callback(err5);
                  const header = rows && rows[0]
                    ? rows[0]
                    : { id: invoiceId, userId, subtotal, tax, totalAmount: total, createdAt: new Date() };
                  return callback(null, { header, items });
                });
              });
              return;
            }

            const item = items[index];
            const qty = parseInt(item.quantity, 10) || 0;
            if (qty <= 0) {
              return updateNext(index + 1);
            }

            db.query(deductSql, [qty, item.productId], (errD) => {
              if (errD) return callback(errD);
              return updateNext(index + 1);
            });
          };

          updateNext(0);
        });
      });
    });
  },

  getById(id, userId, callback) {
    const headerSql = 'SELECT id, userId, subtotal, tax, totalAmount, createdAt FROM invoice WHERE id = ? AND userId = ?';
    db.query(headerSql, [id, userId], (err, results) => {
      if (err) return callback(err);
      if (!results || results.length === 0) {
        return callback(new Error('Invoice not found'));
      }
      const header = results[0];

      const itemsSql = 'SELECT productId, productName, quantity, price FROM invoice_items WHERE invoiceId = ?';
      db.query(itemsSql, [id], (err2, items) => {
        if (err2) return callback(err2);
        return callback(null, { header, items });
      });
    });
  },

  listByUser(userId, callback) {
    const sql = `
      SELECT id, userId, subtotal, tax, totalAmount, createdAt
      FROM invoice
      WHERE userId = ?
      ORDER BY createdAt DESC, id DESC
    `;
    db.query(sql, [userId], (err, results) => {
      if (err) return callback(err);
      const invoices = (results || []).map((row) => ({
        ...row,
        subtotal: parseFloat(row.subtotal) || 0,
        tax: parseFloat(row.tax) || 0,
        totalAmount: parseFloat(row.totalAmount) || 0
      }));
      return callback(null, invoices);
    });
  }
};

module.exports = Invoice;
