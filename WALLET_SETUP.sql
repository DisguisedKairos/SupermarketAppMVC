-- Add e-wallet balance column to users
ALTER TABLE users
  ADD COLUMN walletBalance DECIMAL(10,2) NOT NULL DEFAULT 0;
