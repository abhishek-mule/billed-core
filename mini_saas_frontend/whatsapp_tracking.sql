-- WhatsApp delivery tracking
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  invoice_id VARCHAR(255),
  phone VARCHAR(20) NOT NULL,
  message_text TEXT,
  status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, SENT, DELIVERED, READ, FAILED
  error_code VARCHAR(50),
  error_message TEXT,
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_invoice ON whatsapp_messages(invoice_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_status ON whatsapp_messages(status);