import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

const databaseUrl =
  process.env['DATABASE_URL'] ??
  'postgresql://postgres:postgres@localhost:5432/ai_sales_agent'

const pool = new pg.Pool({ connectionString: databaseUrl })
const db = drizzle(pool)

console.log('Running migrations...')
await migrate(db, { migrationsFolder: './src/db/migrations' })
console.log('Migrations complete')
await pool.end()
process.exit(0)
