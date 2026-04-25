const { spawn } = require('child_process');
const path = require('path');
const { Pool } = require('pg');

const frontendDir = '/mnt/c/Users/HP/Desktop/mini_saas/mini_saas_frontend';

const MIGRATIONS = [
  {
    id: 'm001',
    version: '001',
    description: 'Initial schema with tenants, users, credentials',
    sql: `CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, company_name TEXT NOT NULL, subdomain TEXT UNIQUE, plan TEXT DEFAULT 'free', is_active BOOLEAN DEFAULT true, timezone TEXT DEFAULT 'Asia/Kolkata', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS tenant_users (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT, phone TEXT NOT NULL, password_hash TEXT, role TEXT NOT NULL, is_active BOOLEAN DEFAULT true, last_login_at TIMESTAMPTZ, failed_login_attempts INTEGER DEFAULT 0, locked_until TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(tenant_id, phone));
    CREATE TABLE IF NOT EXISTS tenant_credentials (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL UNIQUE, erp_site_url TEXT, erp_api_key_encrypted TEXT NOT NULL, erp_api_secret_encrypted TEXT NOT NULL, key_version TEXT DEFAULT 'v1', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());`,
  },
  {
    id: 'm002',
    version: '002',
    description: 'Add role_permissions table',
    sql: `CREATE TABLE IF NOT EXISTS role_permissions (id TEXT PRIMARY KEY, role TEXT NOT NULL, permission TEXT NOT NULL, UNIQUE(role, permission));
    CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);`,
  },
  {
    id: 'm003',
    version: '003',
    description: 'Add audit_logs with IP/UA columns',
    sql: `CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT, action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, metadata JSONB, ip_address INET, user_agent TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);`,
  },
  {
    id: 'm004',
    version: '004',
    description: 'Add invoices with ERPNext sync columns',
    sql: `CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, invoice_number TEXT NOT NULL, customer_id TEXT, customer_name TEXT NOT NULL, customer_gstin TEXT, status TEXT DEFAULT 'DRAFT', subtotal NUMERIC(15,2) NOT NULL DEFAULT 0, cgst NUMERIC(15,2) NOT NULL DEFAULT 0, sgst NUMERIC(15,2) NOT NULL DEFAULT 0, igst NUMERIC(15,2) NOT NULL DEFAULT 0, total NUMERIC(15,2) NOT NULL DEFAULT 0, line_items_json JSONB NOT NULL DEFAULT '[]', tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0, discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0, erp_invoice_id TEXT, erp_sync_status TEXT DEFAULT 'PENDING', erp_synced_at TIMESTAMPTZ, erp_sync_error TEXT, gstin TEXT, place_of_supply TEXT, reverse_charge BOOLEAN DEFAULT FALSE, notes TEXT, payment_mode TEXT, due_date TIMESTAMPTZ, invoice_date TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(tenant_id, invoice_number));
    CREATE INDEX IF NOT EXISTS idx_invoices_tenant_number ON invoices(tenant_id, invoice_number);
    CREATE INDEX IF NOT EXISTS idx_invoices_erp_sync ON invoices(tenant_id, erp_sync_status);`,
    rollbackSql: 'DROP TABLE IF EXISTS invoices;',
  },
  {
    id: 'm005',
    version: '005',
    description: 'Add invoice_notifications for multi-channel send tracking',
    sql: `CREATE TABLE IF NOT EXISTS invoice_notifications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR NOT NULL, invoice_id VARCHAR NOT NULL, channel VARCHAR NOT NULL, provider VARCHAR, status VARCHAR NOT NULL, attempt INTEGER DEFAULT 1, provider_message_id VARCHAR, error_code VARCHAR, metadata JSONB, created_at TIMESTAMPTZ DEFAULT NOW(), delivered_at TIMESTAMPTZ, UNIQUE (tenant_id, invoice_id, channel));
    CREATE INDEX IF NOT EXISTS idx_invoice_notifications_tenant_created ON invoice_notifications(tenant_id, created_at DESC);`,
    rollbackSql: 'DROP TABLE IF EXISTS invoice_notifications;',
  },
  {
    id: 'm006',
    version: '006',
    description: 'Add schema_migrations table',
    sql: `CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, version TEXT NOT NULL UNIQUE, description TEXT NOT NULL, applied_at TIMESTAMPTZ DEFAULT NOW(), rollback_sql TEXT);`,
  },
];

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.log('[Migration] DATABASE_URL not set, skipping migrations');
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  async function getCurrentVersion() {
    try {
      const result = await pool.query(
        'SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1'
      );
      return result.rows[0]?.version || null;
    } catch {
      return null;
    }
  }

  console.log('[Migration] Starting...');
  const current = await getCurrentVersion();
  console.log(`[Migration] Current version: ${current || 'none'}`);

  for (const migration of MIGRATIONS) {
    if (current === migration.version) {
      console.log(`[Migration] Skipping ${migration.version} (already applied)`);
      continue;
    }
    if (current && migration.version < current) {
      console.log(`[Migration] Skipping ${migration.version} (older than current)`);
      continue;
    }

    console.log(`[Migration] Applying ${migration.version}: ${migration.description}`);
    try {
      await pool.query('BEGIN');
      await pool.query(migration.sql);
      await pool.query(
        'INSERT INTO schema_migrations (id, version, description, rollback_sql) VALUES ($1, $2, $3, $4)',
        [migration.id, migration.version, migration.description, migration.rollbackSql || null]
      );
      await pool.query('COMMIT');
      console.log(`[Migration] Applied ${migration.version}`);
    } catch (error) {
      await pool.query('ROLLBACK').catch(() => {});
      console.error(`[Migration] Failed ${migration.version}: ${error.message}`);
    }
  }

  await pool.end();
  console.log('[Migration] Complete');
}

async function main() {
  await runMigrations();

  const child = spawn('/mnt/c/nvm4w/nodejs/node.exe', ['dev', '-p', '3000'], {
    cwd: frontendDir,
    detached: true,
    stdio: 'ignore'
  });

  child.unref();
  console.log('Frontend started with PID:', child.pid);
}

main().catch(err => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});