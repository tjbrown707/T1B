// Uses a disposable local PostgreSQL container, never the production database.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
const name = `t1b-backorders-${process.pid}`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
try {
  docker('run', '--name', name, '-e', 'POSTGRES_PASSWORD=local-test-only', '-d', 'postgres:17');
  for (let attempt = 0; attempt < 30; attempt++) {
    // Initialization briefly starts a socket-only server. Wait for the final
    // TCP listener so psql cannot race its shutdown, including in CI.
    try { docker('exec', name, 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1'); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
  let sql = `create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select null::uuid';\n`;
  sql += readFileSync('supabase/schema.sql', 'utf8');
  sql += '\ngrant all on all tables in schema public to service_role;\n';
  for (const migration of readdirSync('supabase/migrations').filter(file => file.endsWith('.sql')).sort()) {
    // schema.sql already includes this original auth/order hardening snapshot.
    if (migration === '20260811000000_harden_order_creation_and_status.sql') continue;
    sql += '\n' + readFileSync(`supabase/migrations/${migration}`, 'utf8');
  }
  sql += '\n' + readFileSync('tests/sql/product-backorders.sql', 'utf8');
  sql += '\n' + readFileSync('tests/sql/fulfillment-method.sql', 'utf8');
  sql += '\n' + readFileSync('tests/sql/automatic-lot-numbers.sql', 'utf8');
  sql += '\n' + readFileSync('tests/sql/dealers.sql', 'utf8');
  sql += '\n' + readFileSync('tests/sql/dealer-discount-codes.sql', 'utf8');
  sql += '\n' + readFileSync('tests/sql/manual-lot-assignment.sql', 'utf8');
  sql += '\n' + readFileSync('tests/sql/staff-payment-email.sql', 'utf8');
  execFileSync('docker', ['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
  console.log('Backorder database lifecycle tests passed.');
} catch (error) {
  console.error(String(error.stderr || error.message));
  process.exitCode = 1;
} finally {
  try { docker('rm', '-f', name); } catch { /* Preserve the original failure. */ }
}
