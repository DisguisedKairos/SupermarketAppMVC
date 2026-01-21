-- Add payment tracking fields for PayPal + NETS QR integration
-- Run this on your existing SupermarketAppMVC database.

ALTER TABLE invoice
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'PAID',
  ADD COLUMN paymentMethod VARCHAR(20) NULL,
  ADD COLUMN provider VARCHAR(20) NULL,
  ADD COLUMN providerRef VARCHAR(128) NULL,
  ADD COLUMN paidAt DATETIME NULL;

-- Optional: index providerRef for faster reconciliation
CREATE INDEX idx_invoice_providerRef ON invoice (providerRef);
