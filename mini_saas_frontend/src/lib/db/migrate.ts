/**
 * Database Migration Runner
 * Executes SQL migration files in order
 * Usage: npx ts-node src/lib/db/migrate.ts
 */

import { query } from './client'
import fs from 'fs'
import path from 'path'

const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations')

interface MigrationRecord {
  name: string
  executed_at: string
}

async function ensureMigrationsTable() {
  try {
    await query(
      `CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      )`
    )
  } catch (error) {
    console.error('Failed to create migrations table:', error)
    throw error
  }
}

async function getExecutedMigrations(): Promise<string[]> {
  try {
    const results = await query<{ name: string }>(
      'SELECT name FROM _migrations ORDER BY executed_at ASC'
    )
    return results.map(r => r.name)
  } catch (error) {
    console.error('Failed to fetch executed migrations:', error)
    return []
  }
}

async function recordMigration(name: string) {
  try {
    await query(
      'INSERT INTO _migrations (name) VALUES ($1)',
      [name]
    )
  } catch (error) {
    console.error(`Failed to record migration ${name}:`, error)
    throw error
  }
}

async function runMigrations() {
  try {
    console.log('[Migrations] Starting migration runner...')
    
    // Ensure migrations table exists
    await ensureMigrationsTable()
    
    // Get already executed migrations
    const executed = await getExecutedMigrations()
    console.log(`[Migrations] Already executed: ${executed.length}`)
    
    // Get all migration files
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.log('[Migrations] No migrations directory found')
      return
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort()

    console.log(`[Migrations] Found ${files.length} migration files`)

    let executed_count = 0

    for (const file of files) {
      if (executed.includes(file)) {
        console.log(`[Migrations] ✓ Already executed: ${file}`)
        continue
      }

      try {
        const filePath = path.join(MIGRATIONS_DIR, file)
        const sql = fs.readFileSync(filePath, 'utf-8')

        console.log(`[Migrations] Executing: ${file}...`)
        
        // Split by semicolon and execute each statement
        const statements = sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0)

        for (const statement of statements) {
          await query(statement)
        }

        await recordMigration(file)
        executed_count++
        console.log(`[Migrations] ✅ Executed: ${file}`)
      } catch (error) {
        console.error(`[Migrations] ❌ Failed on ${file}:`, error)
        throw error
      }
    }

    console.log(`[Migrations] ✅ Migration complete! (${executed_count} new migrations executed)`)

  } catch (error) {
    console.error('[Migrations] Fatal error:', error)
    process.exit(1)
  }
}

// Run if executed directly
if (require.main === module) {
  runMigrations()
}

export { runMigrations }
