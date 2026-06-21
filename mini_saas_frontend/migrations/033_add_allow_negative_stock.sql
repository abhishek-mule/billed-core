-- 033_add_allow_negative_stock.sql
-- Inventory Sovereignty: merchants can choose to allow negative stock
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS allow_negative_stock BOOLEAN NOT NULL DEFAULT true;
