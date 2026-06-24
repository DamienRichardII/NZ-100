/**
 * NZ-100 — Edge Function : create-checkout-session v2
 * ─────────────────────────────────────────────────────
 * Secrets Supabase requis (Project Settings → Edge Functions → Secrets) :
 *   STRIPE_SECRET_KEY   = sk_live_...
 *   SITE_URL            = https://nz-100.vercel.app
 */

import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno';

interface CheckoutPayload {
  booking_request_id?: string;
  offer_type: string;
  customer_email?: string;
  customer_name?: string;
}

const OFFERS: Record<string, { amount: number; label: string; successPage: string }> = {
  // ── Basket séances ──
  coaching_basket_acompte:    { amount: 3000,  label: 'Coaching Basket — acompte 30 €',          successPage: 'coaching-basket.html' },
  coaching_basket_full:       { amount: 7000,  label: 'Coaching Basket — séance complète 70 €',   successPage: 'coaching-basket.html' },
  seance_unitaire:            { amount: 3000,  label: 'Séance à l\'unité — acompte 30 €',         successPage: 'tarifs-basket.html'   },
  // ── Basket forfaits ──
  forfait_5_seances:          { amount: 35000, label: 'Forfait 5 séances Basket — 350 €',         successPage: 'tarifs-basket.html'   },
  forfait_10_seances:         { amount: 65000, label: 'Forfait 10 séances Basket — 650 €',        successPage: 'tarifs-basket.html'   },
  // ── Programmes digitaux ──
  programme_dribble:          { amount: 2999,  label: 'Programme de Dribble — 29,99 €',           successPage: 'tarifs-basket.html'   },
  programme_video_muscu:      { amount: 2999,  label: 'Programme Vidéo Musculation — 29,99 €',    successPage: 'tarifs-musculation.html' },
  // ── Bilan (gratuit) ──
  bilan:                      { amount: 0,     label: 'Bilan Forme & Performance (offert)',        successPage: 'contact.html'         },
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== 'POST') return jsonError(405, 'Méthode non autorisée');

  let payload: CheckoutPayload;
  try { payload = await req.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const { booking_request_id, offer_type, customer_email, customer_name } = payload;
  if (!offer_type || !(offer_type in OFFERS)) {
    return jsonError(400, `offer_type invalide. Valeurs : ${Object.keys(OFFERS).join(', ')}`);
  }

  const offer = OFFERS[offer_type];
  if (offer.amount === 0) return jsonSuccess({ url: null, message: 'Offre gratuite' });

  const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
  const SITE_URL = Deno.env.get('SITE_URL') || 'https://nz-100.vercel.app';
  if (!STRIPE_SECRET_KEY) return jsonError(500, 'STRIPE_SECRET_KEY manquante');

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          unit_amount: offer.amount,
          product_data: { name: offer.label, description: 'NZ-100 — Coaching Mathieu Nzita' },
        },
        quantity: 1,
      }],
      customer_email: customer_email || undefined,
      metadata: { booking_request_id: booking_request_id || '', offer_type, customer_name: customer_name || '', site: 'nz-100' },
      success_url: `${SITE_URL}/${offer.successPage}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${SITE_URL}/${offer.successPage}?payment=cancelled`,
      locale: 'fr',
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });
    console.log('[NZ] Session créée:', session.id, offer_type);
    return jsonSuccess({ url: session.url, session_id: session.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur Stripe inconnue';
    console.error('[NZ] Erreur Stripe:', msg);
    return jsonError(500, `Erreur Stripe : ${msg}`);
  }
});

function jsonSuccess(data: object): Response {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
}
function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
}
function corsHeaders(): Record<string,string> {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
}
