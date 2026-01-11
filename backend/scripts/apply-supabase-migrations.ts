import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

function die(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(msg);
  process.exit(1);
}

function readEnv(name: string): string {
  const v = process.env[name];
  if (!v) die(`Missing env ${name}`);
  return v;
}

function listMigrations(dir: string): string[] {
  if (!fs.existsSync(dir)) die(`Migrations dir not found: ${dir}`);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => path.join(dir, f));
}

function preprocess(sql: string, availableExtensions: Set<string>): string {
  // Supabase-local: Realtime publication doesn't exist; skip those statements safely.
  // Keep the rest intact to preserve schema + functions.
  const lines = sql.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*SET\s+transaction_timeout\s*=/i.test(line)) {
      out.push(`-- [skipped-unknown-guc] ${line}`);
      continue;
    }
    if (line.includes('ALTER PUBLICATION supabase_realtime')) {
      out.push(`-- [skipped-local] ${line}`);
      continue;
    }
    // Supabase dump often contains extensions not present in vanilla Postgres (e.g. pg_graphql).
    // Comment out CREATE/ALTER EXTENSION statements when the extension isn't available.
    const extMatch = line.match(/^\s*(CREATE|ALTER)\s+EXTENSION(\s+IF\s+NOT\s+EXISTS)?\s+\"?([a-zA-Z0-9_]+)\"?/i);
    if (extMatch) {
      const extName = extMatch[3];
      if (!availableExtensions.has(extName)) {
        out.push(`-- [skipped-missing-extension:${extName}] ${line}`);
        continue;
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const supabaseMigrationsDir = path.join(repoRoot, 'supabase', 'migrations');

const DATABASE_URL = readEnv('DATABASE_URL');

const bootstrapSql = `
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS auth;

-- Minimal role set expected by Supabase dumps/policies.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

-- Minimal compat with Supabase: auth.users table used by existing migrations (FKs + trigger).
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  email text UNIQUE,
  encrypted_password text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Supabase RLS/functions reference auth.uid(). Provide a compatible helper.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
`;

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  const { rows } = await client.query<{ name: string }>('SELECT name FROM pg_available_extensions');
  const availableExtensions = new Set<string>(rows.map((r) => r.name));

  try {
    await client.query('BEGIN');
    await client.query(bootstrapSql);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }

  const files = listMigrations(supabaseMigrationsDir);
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf-8');
    const sql = preprocess(raw, availableExtensions);
    // eslint-disable-next-line no-console
    console.log(`Applying ${path.relative(repoRoot, file)}...`);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
    } catch (e: any) {
      await client.query('ROLLBACK');
      // eslint-disable-next-line no-console
      console.error(`Failed at ${file}: ${e?.message || e}`);
      throw e;
    }
  }

  await client.end();
  // eslint-disable-next-line no-console
  console.log('Done.');
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});


