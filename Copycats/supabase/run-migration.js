#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const sql = readFileSync(join(__dirname, 'pending_migrations.sql'), 'utf-8')

console.log('Running migration...')
console.log(sql)

const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql })

if (error) {
  console.error('Migration failed:', error)
  process.exit(1)
}

console.log('Migration completed successfully!')
