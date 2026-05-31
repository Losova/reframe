import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: path.resolve(__dirname, '../../.env')
});

const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY'
];

const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);
if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(', ')}`
  );
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  supabaseUrl: process.env.SUPABASE_URL,
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY ?? null,
  appBaseUrl: process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? null,
  stripePriceId: process.env.STRIPE_PRICE_ID ?? null,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? null,
  monthlyPriceUsd: Number(process.env.MONTHLY_PRICE_USD ?? 18),
  annotationBucketMs: 250,
  bucketName: 'translate-videos',
  uploadDirectory: path.resolve(__dirname, '../uploads'),
  clientDistDirectory: path.resolve(__dirname, '../../client/dist')
};
