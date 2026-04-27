-- Stock reservations for concurrent cart handling
CREATE TABLE IF NOT EXISTS stock_reservations (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  product_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_stock_reservations_product ON stock_reservations(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_session ON stock_reservations(session_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_expires ON stock_reservations(expires_at);