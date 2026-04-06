/* eslint-disable no-console */
/**
 * CLI: generate a new API key for an external system integration.
 *
 * Usage:
 *   npx ts-node src/scripts/create-api-key.ts --name "Garantias" --system "GARANTIAS"
 *
 * Generates a 32-byte hex key, SHA-256 hashes it, inserts into api_keys,
 * and prints the plaintext key ONCE. The plaintext is never persisted.
 */
import { randomBytes, createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

loadEnv({ path: resolve(process.cwd(), '.env') });

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith('--')) {
        args[key] = val;
        i++;
      } else {
        args[key] = 'true';
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = args.name;
  const system = args.system;

  if (!name || !system) {
    console.error(
      'Usage: npx ts-node src/scripts/create-api-key.ts --name "<label>" --system "<SYSTEM_ID>"',
    );
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env',
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const plaintext = randomBytes(32).toString('hex');
  const keyHash = createHash('sha256').update(plaintext).digest('hex');

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      name,
      key_hash: keyHash,
      system_identifier: system,
      is_active: true,
    })
    .select('id, name, system_identifier, created_at')
    .single();

  if (error) {
    console.error('Failed to insert API key:', error.message);
    process.exit(1);
  }

  console.log('');
  console.log('=== API KEY CREATED ===');
  console.log(`ID:     ${data.id}`);
  console.log(`Name:   ${data.name}`);
  console.log(`System: ${data.system_identifier}`);
  console.log('');
  console.log('API KEY (shown ONCE — store securely now):');
  console.log('');
  console.log(`  ${plaintext}`);
  console.log('');
  console.log(
    'Send as `X-API-Key: <key>` header on requests to /api/external/*',
  );
  console.log('');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
