import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 10000
})

pool.query('SELECT 1 as test')
  .then(r => {
    console.log('DB OK:', r.rows)
    pool.end()
  })
  .catch(e => {
    console.error('DB Error:', e.message)
    pool.end()
  })