/**
 * NZ-100 — Edge Function : stripe-webhook v2
 * ──────────────────────────────────────────
 * Reçoit les événements Stripe, met à jour Supabase,
 * et déclenche les emails transactionnels via la fonction send-email.
 *
 * Secrets Supabase requis :
 *   STRIPE_WEBHOOK_SECRET     = whsec_...  (Stripe Dashboard → Webhooks)
 *   STRIPE_SECRET_KEY         = sk_live_...
 *   SUPABASE_SERVICE_ROLE_KEY = (auto-disponible)
 *   SUPABASE_URL              = (auto-disponible)
 *   ADMIN_EMAIL               = mathieunzita60@gmail.com
 *
 * Événements Stripe à activer :
 *   - checkout.session.completed
 *   - checkout.session.expired
 *   - payment_intent.payment_failed
 *
 * URL webhook : https://gzrlhvbqdscccqdcklpn.supabase.co/functions/v1/stripe-webhook
 */

import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OFFER_LABELS: Record<string, string> = {
  coaching_basket_acompte:  "Coaching Basket — acompte 30 €",
  coaching_basket_full:     "Coaching Basket — séance complète 70 €",
  seance_unitaire:          "Séance à l'unité — acompte 30 €",
  forfait_5_seances:        "Forfait 5 séances Basket — 350 €",
  forfait_10_seances:       "Forfait 10 séances Basket — 650 €",
  programme_dribble:        "Programme de Dribble — 29,99 €",
  programme_video_muscu:    "Programme Vidéo Musculation — 29,99 €",
};

function formatEur(centimes: number): string {
  return (centimes / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}
function today(): string {
  return new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('Méthode non autorisée', { status: 405 });

  const STRIPE_SECRET_KEY     = Deno.env.get('STRIPE_SECRET_KEY');
  const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const SUPABASE_URL          = Deno.env.get('SUPABASE_URL') || 'https://gzrlhvbqdscccqdcklpn.supabase.co';
  const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const ADMIN_EMAIL           = Deno.env.get('ADMIN_EMAIL') || 'mathieunzita60@gmail.com';

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET)
    return new Response('Secrets Stripe manquants', { status: 500 });
  if (!SUPABASE_SERVICE_KEY)
    return new Response('SUPABASE_SERVICE_ROLE_KEY manquante', { status: 500 });

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

  console.log('[NZ Webhook] Événement :', event.type, event.id);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  async function sendEmail(type: string, to: string, data: Record<string, string>): Promise<void> {
    try {
      const { error } = await supabase.functions.invoke('send-email', { body: { type, to, data } });
      if (error) console.error('[NZ Webhook] send-email error:', error.message);
      else console.log('[NZ Webhook] Email:', type, '->', to);
    } catch (e: unknown) {
      console.error('[NZ Webhook] send-email exception:', e instanceof Error ? e.message : e);
    }
  }

  switch (event.type) {

    case 'checkout.session.completed': {
      const session       = event.data.object as Stripe.Checkout.Session;
      const meta          = session.metadata || {};
      const bookingId     = meta.booking_request_id || null;
      const offerType     = meta.offer_type          || null;
      const customerName  = meta.customer_name        || 'Client';
      const customerEmail = session.customer_email    || null;
      const amountEur     = session.amount_total      || 0;
      const currency      = session.currency          || 'eur';
      const paymentIntent = typeof session.payment_intent === 'string'
        ? session.payment_intent : session.payment_intent?.id || null;
      const offerLabel    = offerType ? (OFFER_LABELS[offerType] || offerType) : 'Prestation NZ-100';

      console.log('[NZ Webhook] completed — session:', session.id, '— offer:', offerType, '—', amountEur, 'cts');

      // 1. Insérer payment
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
        console.error('[NZ Webhook] payments insert:', payError.message);
        if (!payError.message.includes('duplicate') && !payError.message.includes('unique'))
          return new Response('Erreur base de données', { status: 500 });
        console.warn('[NZ Webhook] Doublon — paiement déjà enregistré');
      } else {
        console.log('[NZ Webhook] Payment:', payment?.id);
      }

      // 2. Mettre à jour booking
      if (bookingId) {
        const newStatus = (offerType === 'coaching_basket_acompte' || offerType === 'seance_unitaire')
          ? 'payment_received' : 'confirmed';
        const { error: bkErr } = await supabase
          .from('booking_requests')
          .update({ payment_status: 'paid', stripe_checkout_session_id: session.id, status: newStatus })
          .eq('id', bookingId);
        if (bkErr) console.error('[NZ Webhook] booking_requests update:', bkErr.message);
        else console.log('[NZ Webhook] booking', bookingId, '->', newStatus);
      }

      // 3. Infos réservation pour emails
      let bookingDate = '';
      let bookingTime = '';
      let bookingType = offerLabel;
      if (bookingId) {
        const { data: bk } = await supabase
          .from('booking_requests')
          .select('preferred_date, preferred_time, session_type')
          .eq('id', bookingId)
          .single();
        if (bk) {
          bookingDate = bk.preferred_date
            ? new Date(bk.preferred_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
            : '';
          bookingTime = bk.preferred_time || '';
          bookingType = bk.session_type   || offerLabel;
        }
      }

      // 4. Emails
      if (customerEmail) {
        await sendEmail('confirmation_paiement', customerEmail, {
          name:       customerName,
          offer:      offerLabel,
          amount:     formatEur(amountEur),
          date:       today(),
          session_id: session.id,
          next_steps: bookingDate
            ? `Votre séance est planifiée le ${bookingDate}${bookingTime ? ' à ' + bookingTime : ''}. Mathieu vous confirmera sous 24h.`
            : 'Mathieu vous contactera sous 24h pour confirmer les prochaines étapes.',
        });
        if (bookingId && bookingDate) {
          await sendEmail('confirmation_reservation', customerEmail, {
            name: customerName, date: bookingDate, time: bookingTime,
            session_type: bookingType, location: 'Communiquée par Mathieu sous 24h',
          });
        }
      }

      await sendEmail('notif_admin_reservation', ADMIN_EMAIL, {
        client_name:    customerName,
        client_email:   customerEmail || '(non renseigné)',
        offer:          offerLabel,
        date:           bookingDate || '(à définir)',
        time:           bookingTime || '',
        payment_status: `✓ Payé — ${formatEur(amountEur)}`,
      });

      break;
    }

    case 'checkout.session.expired': {
      const session   = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.booking_request_id || null;
      console.log('[NZ Webhook] expired ─', session.id, '— booking:', bookingId);
      if (bookingId) {
        await supabase.from('booking_requests')
          .update({ payment_status: 'unpaid' })
          .eq('id', bookingId).eq('payment_status', 'pending');
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const pi            = event.data.object as Stripe.PaymentIntent;
      const sessionId     = typeof pi.metadata?.session_id === 'string' ? pi.metadata.session_id : null;
      const customerEmail = typeof pi.receipt_email === 'string' ? pi.receipt_email : null;
      const offerType     = pi.metadata?.offer_type || '';
      const offerLabel    = OFFER_LABELS[offerType] || offerType || 'Prestation NZ-100';

      console.log('[NZ Webhook] payment_failed ─', pi.id);

      if (sessionId) {
        await supabase.from('booking_requests')
          .update({ payment_status: 'failed' })
          .eq('stripe_checkout_session_id', sessionId);
      }
      await supabase.from('payments').insert([{
        stripe_payment_intent_id: pi.id,
        amount_eur: pi.amount || 0,
        currency: pi.currency || 'eur',
        status: 'failed',
      }]);

      if (customerEmail) {
        await sendEmail('paiement_refuse', customerEmail, {
          name:      pi.metadata?.customer_name || 'Client',
          offer:     offerLabel,
          retry_url: 'https://nz-100.vercel.app/tarifs.html',
        });
      }
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
