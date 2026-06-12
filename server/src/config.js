import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: process.env.REFRAME_ENV_FILE ?? path.resolve(__dirname, '../../.env')
});

const hasSupabaseConfig = Boolean(
  process.env.SUPABASE_URL &&
    process.env.SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SECRET_KEY
);

const requestedStorageMode = process.env.STORAGE_MODE?.toLowerCase();
const storageMode =
  requestedStorageMode === 'supabase'
    ? 'supabase'
    : requestedStorageMode === 'local'
      ? 'local'
      : hasSupabaseConfig
        ? 'supabase'
        : 'local';

export const config = {
  host: process.env.HOST ?? null,
  port: Number(process.env.PORT ?? 3001),
  storageMode,
  hasSupabaseConfig,
  supabaseUrl: process.env.SUPABASE_URL ?? null,
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? null,
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? null,
  openaiApiKey: process.env.OPENAI_API_KEY ?? null,
  aiFallbackEnabled: process.env.AI_FALLBACK_ENABLED !== 'false',
  appBaseUrl: process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? null,
  stripePriceId: process.env.STRIPE_PRICE_ID ?? null,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? null,
  monthlyPriceUsd: Number(process.env.MONTHLY_PRICE_USD ?? 18),
  annotationBucketMs: 250,
  bucketName: 'translate-videos',
  uploadDirectory:
    process.env.REFRAME_UPLOAD_DIR ?? path.resolve(__dirname, '../uploads'),
  localDataDirectory:
    process.env.REFRAME_DATA_DIR ?? path.resolve(__dirname, '../data'),
  clientDistDirectory:
    process.env.REFRAME_CLIENT_DIST_DIR ??
    path.resolve(__dirname, '../../client/dist')
};
