import { createClient } from '@supabase/supabase-js';

let cachedClient;
let cachedSignature = '';

export function createBrowserSupabase(config) {
  const nextSignature = `${config.supabaseUrl}::${config.supabasePublishableKey}`;

  if (!cachedClient || cachedSignature !== nextSignature) {
    cachedClient = createClient(
      config.supabaseUrl,
      config.supabasePublishableKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
    cachedSignature = nextSignature;
  }

  return cachedClient;
}
