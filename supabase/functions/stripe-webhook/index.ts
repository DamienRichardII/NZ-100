/**
 * NZ-100 — Edge Function : stripe-webhook
 * ────────────────────────────────────────
 * Reçoit les événements Stripe (checkout.session.completed, etc.)
 * et met à jour la base Supabase en conséquence.
 *
 * Secrets Supabase requis :
 *   STRIPE_WEBHOOK_SECRET    = whsec_...  (depuis Stripe Dashboard → Webhooks)
 *   STRIPE_SECRET_KEY        = sk_live_...
 *   SUPABASE_SERVICE_ROLE_KEY = auto-disponible dans les Edge Functions Supabase
 *   SUPABASE_URL              = auto-disponible dans les Edge Functions Supabase
 *
 * Événements Stripe à configurer dans le Dashboard Stripe → Webhooks :
 *   - checkout.session.completed
 *   - checkout.session.expired
 *   - payment_intent.payment_failed
 *
 * URL du webhook à enregistrer dans Stripe :
 *   https://gzrlhvbqdscccqdcklpn.supabase.co/functions/v1/stripe-webhook
 *
 * Déploiement :
 *   supabase functions deploy stripe-webhook --no-verify-jwt
 */

import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Handler ──────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response('Méthode non autorisée', { status: 405 });
  }

  // ── Secrets ────────────────────────────────────────────────────
  const STRIPE_SECRET_KEY      = Deno.env.get('STRIPE_SECRET_KEY');
  const STRIPE_WEBHOOK_SECRET  = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const SUPABASE_URL           = Deno.env.get('SUPABASE_URL') || 'https://gzrlhvbqdscccqdcklpn.supabase.co';
  const SUPABASE_SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.error('[NZ Webhook] Secrets Stripe manquants');
    return new Response('Configuration manquante', { status: 500 });
  }
  if (!SUPABASE_SERVICE_KEY) {
    console.error('[NZ Webhook] SUPABASE_SERVICE_ROLE_KEY manquante');
    return new Response('Configuration Supabase manquante', { status: 500 });
  }

  // ── Vérification signature Stripe ──────────────────────────────
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  const body   = await req.text();
  const sig    = req.headers.get('stripe-signature') || '';

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    console.error('[NZ Webhook] Signature invalide :', msg);
    return new Response(`Webhook signature invalide : ${msg}`, { status: 400 });
  }

  console.log('[NZ Webhook] Événement reçu :', event.type, event.id);

  // ── Client Supabase avec service_role (bypass RLS) ─────────────
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Traitement des événements ───────────────────────────────────
  switch (event.type) {

    // ── Paiement réussi ───────────────────────────────────────────
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const meta    = session.metadata || {};

      const bookingId    = meta.booking_request_id || null;
      const offerType    = meta.offer_type          || null;
      const customerName = meta.customer_name        || null;
      const amountEur    = session.amount_total      || 0;    // en centimes
      const currency     = session.currency          || 'eur';
      const paymentIntent = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null;

      console.log('[NZ Webhook] checkout.session.completed ─', session.id,
        '— booking_request_id:', bookingId, '— offer:', offerType, '— montant:', amountEur, 'cts');

      // 1. Insérer dans public.payments
      const { data: payment, error: payError } = await supabase
        .from('payments')
        .insert([{
          booking_request_id:         bookingId,
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id:   paymentIntent,
          amount_eur:                 amountEur,
          currency,
          status:                     'paid',
          paid_at:                    new Date().toISOString(),
        }])
        .select()
        .single();

      if (payError) {
        console.error('[NZ Webhook] Erreur insertion payments :', payError.message);
        // On ne retourne pas 500 pour ne pas faire rejouer Stripe en boucle
        // sauf si c'est une erreur critique autre que doublon (unique constraint)
        if (!payError.message.includes('duplicate') && !payError.message.includes('unique')) {
          return new Response('Erreur base de données', { status: 500 });
        }
        console.warn('[NZ Webhook] Paiement déjà enregistré (doublon) — OK');
      } else {
        console.log('[NZ Webhook] Payment enregistré :', payment?.id);
      }

      // 2. Mettre à jour booking_requests
      if (bookingId) {
        const newStatus = offerType === 'coaching_basket_acompte'
          ? 'payment_received'   // acompte reçu → en attente confirmation finale
          : 'confirmed';         // paiement complet → directement confirmé

        const { error: bookingError } = await supabase
          .from('booking_requests')
          .update({
            payment_status:             'paid',
            stripe_checkout_session_id: session.id,
            status:                     newStatus,
          })
          .eq('id', bookingId);

        if (bookingError) {
          console.error('[NZ Webhook] Erreur mise à jour booking_requests :', bookingError.message);
        } else {
          console.log('[NZ Webhook] booking_request', bookingId, '→ payment_status=paid, status=', newStatus);
        }
      }

      break;
    }

    // ── Session expirée (client a abandonné) ─────────────────────
    case 'checkout.session.expired': {
      const session   = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.booking_request_id || null;

      console.log('[NZ Webhook] checkout.session.expired ─', session.id, '— booking:', bookingId);

      if (bookingId) {
        await supabase
          .from('booking_requests')
          .update({ payment_status: 'unpaid' })
          .eq('id', bookingId)
          .eq('payment_status', 'pending'); // ne pas écraser un 'paid'
      }
      break;
    }

    // ── Paiement échoué ───────────────────────────────────────────
    case 'payment_intent.payment_failed': {
      const pi        = event.data.object as Stripe.PaymentIntent;
      const sessionId = typeof pi.metadata?.session_id === 'string'
        ? pi.metadata.session_id : null;

      console.log('[NZ Webhook] payment_intent.payment_failed ─', pi.id);

      if (sessionId) {
        await supabase
          .from('booking_requests')
          .update({ payment_status: 'failed' })
          .eq('stripe_checkout_session_id', sessionId);
      }

      // Insérer un enregistrement failed dans payments
      await supabase
        .from('payments')
        .insert([{
          stripe_payment_intent_id: pi.id,
          amount_eur: pi.amount || 0,
          currency: pi.currency || 'eur',
          status: 'failed',
        }]);

      break;
    }

    default:
      console.log('[NZ Webhook] Événement ignoré :', event.type);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
