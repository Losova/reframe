import Stripe from 'stripe';

const STRIPE_API_VERSION = '2026-02-25.clover';

export function isStripeConfigured(runtimeConfig) {
  return Boolean(runtimeConfig.stripeSecretKey && runtimeConfig.stripePriceId);
}

export function createStripeClient(runtimeConfig) {
  if (!runtimeConfig.stripeSecretKey) {
    return null;
  }

  return new Stripe(runtimeConfig.stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION
  });
}

export async function createSubscriptionCheckoutSession({
  email,
  runtimeConfig,
  workspaceName
}) {
  const stripe = createStripeClient(runtimeConfig);

  if (!stripe || !runtimeConfig.stripePriceId) {
    throw new Error('Stripe billing is not configured.');
  }

  const baseUrl = runtimeConfig.appBaseUrl.replace(/\/$/, '');
  const trimmedWorkspaceName = workspaceName.trim();

  return stripe.checkout.sessions.create({
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    customer_email: email.trim(),
    line_items: [
      {
        price: runtimeConfig.stripePriceId,
        quantity: 1
      }
    ],
    metadata: {
      workspaceName: trimmedWorkspaceName
    },
    mode: 'subscription',
    subscription_data: {
      metadata: {
        workspaceName: trimmedWorkspaceName
      }
    },
    success_url: `${baseUrl}/?checkout=success`,
    cancel_url: `${baseUrl}/?checkout=cancelled`
  });
}

export function constructStripeWebhookEvent({ body, runtimeConfig, signature }) {
  const stripe = createStripeClient(runtimeConfig);

  if (!stripe || !runtimeConfig.stripeWebhookSecret) {
    throw new Error('Stripe webhook handling is not configured.');
  }

  return stripe.webhooks.constructEvent(
    body,
    signature,
    runtimeConfig.stripeWebhookSecret
  );
}
