-- 009_add_risk_scoring.sql
ALTER TABLE customers ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 50;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high'));
