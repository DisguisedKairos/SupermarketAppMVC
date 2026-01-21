// Invoice model using `invoice` and `invoice_items` tables
const db = require('../db');

const Invoice = {
  addStatusHistory({ invoiceId, status, note, actorUserId, actorRole }, callback) {
    const sql = `
      INSERT INTO invoice_status_history (invoiceId, status, note, actorUserId, actorRole)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.query(sql, [invoiceId, status, note || null, actorUserId || null, actorRole || null], (err) => {
      if (err) return callback ? callback(err) : null;
      return callback ? callback(null, true) : null;
    });
  },
  /**
   * Create an invoice from the current user's cart.
   * - Validates that cart is not empty
   * - Validates that requested quantities do not exceed current product stock
   * - Inserts into `invoice` and `invoice_items`
   * - Deducts stock from `products.quantity`
   * - Clears the cart
   * - Returns header + items for rendering
   */
  createFromCart(userId, paymentMethod, callback) {
    if (typeof paymentMethod === 'function') {
      callback = paymentMethod;
      paymentMethod = null;
    }
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
        return callback(
          new Error(
            `Not enough stock for "${insufficient.productName}". Available: ${available}.`
          )
        );
      }

      // Calculate totals
      let subtotal = 0;
      items.forEach((item) => {
        subtotal +=
          (parseFloat(item.price) || 0) * (parseInt(item.quantity, 10) || 0);
      });
      subtotal = parseFloat(subtotal.toFixed(2));
      const tax = 0; // set GST if required
      const total = parseFloat((subtotal + tax).toFixed(2));

      // Insert invoice header
      const invSql = `INSERT INTO invoice (userId, subtotal, tax, totalAmount, createdAt, status, paymentMethod, paidAt)
        VALUES (?, ?, ?, ?, NOW(), 'PAID', ?, NOW())`;
      db.query(invSql, [userId, subtotal, tax, total, paymentMethod], (err2, result) => {
        if (err2) return callback(err2);
        const invoiceId = result.insertId;

        // Insert invoice items
        const values = items.map((item) => [
          invoiceId,
          item.productId,
          item.productName,
          item.quantity,
          item.price,
        ]);

        const itemsSql =
          'INSERT INTO invoice_items (invoiceId, productId, productName, quantity, price) VALUES ?';
        db.query(itemsSql, [values], (err3) => {
          if (err3) return callback(err3);

          // Deduct stock for each purchased product
          const deductSql =
            'UPDATE products SET quantity = quantity - ? WHERE id = ?';

          const updateNext = (index) => {
            if (index >= items.length) {
              // After stock is updated, clear the cart
              const clearSql = 'DELETE FROM cart WHERE userId = ?';
              db.query(clearSql, [userId], (err4) => {
                if (err4) return callback(err4);

                // Load fresh header for return
                const headerSql =
                  'SELECT id, userId, subtotal, tax, totalAmount, createdAt, status, paymentMethod, provider, providerRef, paidAt FROM invoice WHERE id = ?';
                db.query(headerSql, [invoiceId], (err5, rows) => {
                  if (err5) return callback(err5);
                  const header =
                    rows && rows[0]
                      ? rows[0]
                      : {
                          id: invoiceId,
                          userId,
                          subtotal,
                          tax,
                          totalAmount: total,
                          createdAt: new Date(),
                        };

                  Invoice.addStatusHistory(
                    { invoiceId, status: 'PAID', note: 'Invoice paid at checkout', actorUserId: userId, actorRole: 'user' },
                    () => {}
                  );
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

  
  /**
   * Create an invoice from cart but keep it in PENDING_PAYMENT status.
   * - Validates cart is not empty
   * - Validates stock availability at the moment of creation
   * - Inserts into `invoice` and `invoice_items`
   * - DOES NOT deduct stock
   * - DOES NOT clear cart
   *
   * Returns { header, items } (header includes new invoice id)
   */
  createPendingFromCart(userId, paymentMethod, callback) {
    const cartSql = `
      SELECT
        c.id as cartId,
        c.productId,
        p.productName as productName,
        p.price,
        c.quantity,
        p.quantity as stockQty
      FROM cart c
      JOIN products p ON p.id = c.productId
      WHERE c.userId = ?
      ORDER BY c.id ASC
    `;

    db.query(cartSql, [userId], (err, items) => {
      if (err) return callback(err);
      if (!items || items.length === 0) {
        return callback(new Error('Your cart is empty.'));
      }

      // Validate stock
      for (const it of items) {
        const qty = parseInt(it.quantity, 10) || 0;
        const stock = parseInt(it.stockQty, 10) || 0;
        if (qty <= 0) return callback(new Error('Invalid quantity in cart.'));
        if (qty > stock) {
          return callback(new Error(`Not enough stock for ${it.productName}. Available: ${stock}`));
        }
      }

      const subtotal = items.reduce((sum, it) => sum + (parseFloat(it.price) || 0) * (parseInt(it.quantity, 10) || 0), 0);
      const taxRate = 0;
      const tax = 0;
      const totalAmount = subtotal;

      db.beginTransaction((txErr) => {
        if (txErr) return callback(txErr);

        const headerSql = `
          INSERT INTO invoice (userId, subtotal, tax, totalAmount, createdAt, status, paymentMethod)
          VALUES (?, ?, ?, ?, NOW(), 'PENDING_PAYMENT', ?)
        `;
        db.query(headerSql, [userId, subtotal, tax, totalAmount, paymentMethod], (errH, resultH) => {
          if (errH) {
            return db.rollback(() => callback(errH));
          }
          const invoiceId = resultH.insertId;

          const itemSql = `
            INSERT INTO invoice_items (invoiceId, productId, productName, quantity, price)
            VALUES ?
          `;
          const values = items.map((it) => [
            invoiceId,
            it.productId,
            it.productName,
            parseInt(it.quantity, 10) || 0,
            parseFloat(it.price) || 0,
          ]);

          db.query(itemSql, [values], (errI) => {
            if (errI) {
              return db.rollback(() => callback(errI));
            }

            db.commit((errC) => {
              if (errC) return db.rollback(() => callback(errC));

              const header = {
                id: invoiceId,
                userId,
                subtotal,
                tax,
                totalAmount,
                createdAt: new Date(),
                status: 'PENDING_PAYMENT',
                paymentMethod,
              };

              // Normalize item fields for EJS
              const normalizedItems = items.map((it) => ({
                productId: it.productId,
                productName: it.productName,
                quantity: parseInt(it.quantity, 10) || 0,
                price: parseFloat(it.price) || 0,
              }));

              Invoice.addStatusHistory(
                { invoiceId, status: 'PENDING_PAYMENT', note: 'Invoice created, awaiting payment', actorUserId: userId, actorRole: 'user' },
                () => {}
              );
              return callback(null, { header, items: normalizedItems });
            });
          });
        });
      });
    });
  },

  /**
   * Mark invoice as PAID and finalize stock deduction + cart clear atomically.
   * This re-validates stock at the time of payment finalization.
   */
  markPaid({ invoiceId, userId, paymentMethod, provider, providerRef }, callback) {
    db.beginTransaction((txErr) => {
      if (txErr) return callback(txErr);

      const loadItemsSql = 'SELECT productId, quantity FROM invoice_items WHERE invoiceId = ?';
      db.query(loadItemsSql, [invoiceId], (errItems, invItems) => {
        if (errItems) return db.rollback(() => callback(errItems));
        if (!invItems || invItems.length === 0) {
          return db.rollback(() => callback(new Error('Invoice items not found.')));
        }

        // Re-check stock for each item
        const checkNext = (i) => {
          if (i >= invItems.length) return deductNext(0);

          const it = invItems[i];
          const qty = parseInt(it.quantity, 10) || 0;
          db.query('SELECT quantity FROM products WHERE id = ?', [it.productId], (errQ, rows) => {
            if (errQ) return db.rollback(() => callback(errQ));
            const stock = rows && rows[0] ? parseInt(rows[0].quantity, 10) || 0 : 0;
            if (qty > stock) {
              return db.rollback(() => callback(new Error('Not enough stock to complete payment. Please try again.')));
            }
            return checkNext(i + 1);
          });
        };

        const deductNext = (i) => {
          if (i >= invItems.length) return finalizeInvoice();

          const it = invItems[i];
          const qty = parseInt(it.quantity, 10) || 0;
          db.query('UPDATE products SET quantity = quantity - ? WHERE id = ?', [qty, it.productId], (errU) => {
            if (errU) return db.rollback(() => callback(errU));
            return deductNext(i + 1);
          });
        };

        const finalizeInvoice = () => {
          const updateSql = `
            UPDATE invoice
            SET status='PAID',
                paymentMethod = ?,
                provider = ?,
                providerRef = ?,
                paidAt = NOW()
            WHERE id = ? AND userId = ?
          `;
          db.query(updateSql, [paymentMethod, provider || null, providerRef || null, invoiceId, userId], (errUp) => {
            if (errUp) return db.rollback(() => callback(errUp));

            // Clear cart only after invoice is paid
            db.query('DELETE FROM cart WHERE userId = ?', [userId], (errClr) => {
              if (errClr) return db.rollback(() => callback(errClr));

              db.commit((errC) => {
                if (errC) return db.rollback(() => callback(errC));
                Invoice.addStatusHistory(
                  { invoiceId, status: 'PAID', note: 'Payment completed', actorUserId: userId, actorRole: 'user' },
                  () => {}
                );
                return callback(null, true);
              });
            });
          });
        };

        return checkNext(0);
      });
    });
  },

  markCancelled({ invoiceId, userId, reason }, callback) {
    const sql = `
      UPDATE invoice
      SET status='CANCELLED'
      WHERE id = ? AND userId = ?
    `;
    db.query(sql, [invoiceId, userId], (err) => {
      if (err) return callback(err);
      Invoice.addStatusHistory(
        { invoiceId, status: 'CANCELLED', note: reason || 'Payment cancelled', actorUserId: userId, actorRole: 'user' },
        () => {}
      );
      return callback(null, true);
    });
  },

  markVoided({ invoiceId, adminUserId, reason }, callback) {
    const sql = `
      UPDATE invoice
      SET status='VOIDED',
          voidedAt = NOW()
      WHERE id = ? AND status = 'PENDING_PAYMENT'
    `;
    db.query(sql, [invoiceId], (err, result) => {
      if (err) return callback(err);
      if (!result || result.affectedRows === 0) {
        return callback(new Error('Invoice cannot be voided in its current status.'));
      }
      Invoice.addStatusHistory(
        { invoiceId, status: 'VOIDED', note: reason || 'Payment voided by admin', actorUserId: adminUserId, actorRole: 'admin' },
        () => {}
      );
      return callback(null, true);
    });
  },

  refund({ invoiceId, adminUserId, amount, reason }, callback) {
    const loadSql = `
      SELECT id, userId, totalAmount, refundedAmount, status
      FROM invoice
      WHERE id = ?
      LIMIT 1
    `;
    db.query(loadSql, [invoiceId], (err, rows) => {
      if (err) return callback(err);
      if (!rows || rows.length === 0) return callback(new Error('Invoice not found.'));

      const inv = rows[0];
      const currentStatus = inv.status;
      if (currentStatus !== 'PAID' && currentStatus !== 'PARTIALLY_REFUNDED') {
        return callback(new Error('Invoice is not eligible for refund.'));
      }

      const totalAmount = parseFloat(inv.totalAmount) || 0;
      const refundedAmount = parseFloat(inv.refundedAmount) || 0;
      const remaining = parseFloat((totalAmount - refundedAmount).toFixed(2));
      const reqAmount = parseFloat(amount);

      if (!Number.isFinite(reqAmount) || reqAmount <= 0) {
        return callback(new Error('Refund amount must be greater than 0.'));
      }
      if (reqAmount > remaining) {
        return callback(new Error(`Refund amount exceeds remaining balance (${remaining.toFixed(2)}).`));
      }

      const newRefunded = parseFloat((refundedAmount + reqAmount).toFixed(2));
      const isFull = newRefunded >= totalAmount;
      const newStatus = isFull ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      const refundStatus = isFull ? 'FULL' : 'PARTIAL';

      db.beginTransaction((txErr) => {
        if (txErr) return callback(txErr);

        const refundSql = `
          INSERT INTO invoice_refunds (invoiceId, amount, reason, createdByUserId)
          VALUES (?, ?, ?, ?)
        `;
        db.query(refundSql, [invoiceId, reqAmount, reason || null, adminUserId || null], (errR) => {
          if (errR) {
            return db.rollback(() => callback(errR));
          }

          const updateSql = `
            UPDATE invoice
            SET refundedAmount = ?,
                refundStatus = ?,
                status = ?
            WHERE id = ?
          `;
          db.query(updateSql, [newRefunded, refundStatus, newStatus, invoiceId], (errU) => {
            if (errU) {
              return db.rollback(() => callback(errU));
            }

            db.commit((errC) => {
              if (errC) return db.rollback(() => callback(errC));
              Invoice.addStatusHistory(
                {
                  invoiceId,
                  status: newStatus,
                  note: reason || `Refunded ${reqAmount.toFixed(2)}`,
                  actorUserId: adminUserId,
                  actorRole: 'admin',
                },
                () => {}
              );
              return callback(null, true);
            });
          });
        });
      });
    });
  },

  updateProviderMeta({ invoiceId, userId, provider, providerRef }, callback) {
    const sql = `
      UPDATE invoice
      SET provider = ?, providerRef = ?
      WHERE id = ? AND userId = ?
    `;
    db.query(sql, [provider || null, providerRef || null, invoiceId, userId], (err) => {
      if (err) return callback(err);
      return callback(null, true);
    });
  },

  /**
   * Lookup invoice by provider + providerRef.
   * Useful for NETS SSE reconciliation using txn_retrieval_ref.
   */
  findByProviderRef(provider, providerRef, callback) {
    const sql = 'SELECT id, userId, status, paymentMethod, provider, providerRef FROM invoice WHERE provider = ? AND providerRef = ? LIMIT 1';
    db.query(sql, [provider, providerRef], (err, rows) => {
      if (err) return callback(err);
      if (!rows || rows.length === 0) return callback(new Error('Invoice not found for provider reference'));
      return callback(null, rows[0]);
    });
  },

  getStatus(invoiceId, userId, callback) {
    const sql = 'SELECT id, status, paymentMethod, provider, providerRef, paidAt, refundedAmount, refundStatus, voidedAt FROM invoice WHERE id = ? AND userId = ?';
    db.query(sql, [invoiceId, userId], (err, rows) => {
      if (err) return callback(err);
      if (!rows || rows.length === 0) return callback(new Error('Invoice not found'));
      return callback(null, rows[0]);
    });
  },

getById(id, userId, callback) {
    const headerSql =
      'SELECT id, userId, subtotal, tax, totalAmount, createdAt, status, paymentMethod, provider, providerRef, paidAt, refundedAmount, refundStatus, voidedAt FROM invoice WHERE id = ? AND userId = ?';
    db.query(headerSql, [id, userId], (err, results) => {
      if (err) return callback(err);
      if (!results || results.length === 0) {
        return callback(new Error('Invoice not found'));
      }
      const header = results[0];

      const itemsSql =
        'SELECT productId, productName, quantity, price FROM invoice_items WHERE invoiceId = ?';
      db.query(itemsSql, [id], (err2, items) => {
        if (err2) return callback(err2);
        const historySql = `
          SELECT status, note, actorUserId, actorRole, createdAt
          FROM invoice_status_history
          WHERE invoiceId = ?
          ORDER BY createdAt ASC, id ASC
        `;
        db.query(historySql, [id], (errH, historyRows) => {
          if (errH) return callback(errH);
          const refundsSql = `
            SELECT amount, reason, createdAt, createdByUserId
            FROM invoice_refunds
            WHERE invoiceId = ?
            ORDER BY createdAt ASC, id ASC
          `;
          db.query(refundsSql, [id], (errR, refundRows) => {
            if (errR) return callback(errR);
            return callback(null, { header, items, history: historyRows || [], refunds: refundRows || [] });
          });
        });
      });
    });
  },

  listByUser(userId, callback) {
    const sql = `
      SELECT id, userId, subtotal, tax, totalAmount, createdAt, status, paymentMethod, provider, providerRef, paidAt, refundedAmount, refundStatus, voidedAt
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
        totalAmount: parseFloat(row.totalAmount) || 0,
        refundedAmount: parseFloat(row.refundedAmount) || 0,
      }));
      return callback(null, invoices);
    });
  },

  // Simple wrapper so admin "viewUserHistory" can call Invoice.findByUserId
  findByUserId(userId, callback) {
    return Invoice.listByUser(userId, callback);
  },
};

module.exports = Invoice;
