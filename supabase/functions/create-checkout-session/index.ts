/**
 * NZ-100 — Edge Function : create-checkout-session v3
 * ─────────────────────────────────────────────────────
 * Secrets Supabase (Project Settings → Edge Functions → Secrets) :
 *   STRIPE_SECRET_KEY   = sk_live_...
 *   SITE_URL            = https://nz-100.vercel.app
 *
 * CORS : tous les headers envoyés par @supabase/supabase-js sont explicitement autorisés.
 */

import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno';

interface CheckoutPayload {
  booking_request_id?: string;
  offer_type: string;
  customer_email?: string;
  customer_name?: string;
}

const OFFERS: Record<string, { amount: number; label: string; successPage: string }> = {
  coaching_basket_acompte:  { amount: 3000,  label: 'Coaching Basket — acompte 30 €',         successPage: 'coaching-basket.html'    },
  coaching_basket_full:     { amount: 7000,  label: 'Coaching Basket — séance complète 70 €',  successPage: 'coaching-basket.html'    },
  seance_unitaire:          { amount: 3000,  label: 'Séance à l\'unité — acompte 30 €',        successPage: 'tarifs-basket.html'      },
  forfait_5_seances:        { amount: 35000, label: 'Forfait 5 séances Basket — 350 €',        successPage: 'tarifs-basket.html'      },
  forfait_10_seances:       { amount: 65000, label: 'Forfait 10 séances Basket — 650 €',       successPage: 'tarifs-basket.html'      },
  programme_dribble:        { amount: 2999,  label: 'Programme de Dribble — 29,99 €',          successPage: 'tarifs-basket.html'      },
  programme_video_muscu:    { amount: 2999,  label: 'Programme Vidéo Musculation — 29,99 €',   successPage: 'tarifs-musculation.html' },
  bilan:                    { amount: 0,     label: 'Bilan Forme & Performance (offert)',       successPage: 'contact.html'            },
};

// ─── CORS headers ─────────────────────────────────────────────────────────────
// Inclut TOUS les headers que @supabase/supabase-js envoie dans le preflight.
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  };
}

function jsonOk(data: object): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}
function jsonErr(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {

  // ── Preflight OPTIONS ────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    console.log('[NZ checkout] OPTIONS preflight OK');
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== 'POST') return jsonErr(405, 'Méthode non autorisée');

  // ── Parse payload ────────────────────────────────────────────────────────────
  let payload: CheckoutPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonErr(400, 'JSON invalide');
  }

  const { booking_request_id, offer_type, customer_email, customer_name } = payload;

  if (!offer_type) return jsonErr(400, 'offer_type requis');
  if (!(offer_type in OFFERS)) {
    return jsonErr(400, `offer_type invalide. Valeurs acceptées : ${Object.keys(OFFERS).join(', ')}`);
  }

  const offer = OFFERS[offer_type];

  // Offre gratuite → pas de session Stripe
  if (offer.amount === 0) {
    return jsonOk({ url: null, message: 'Offre gratuite — aucun paiement requis.' });
  }

  // ── Secrets ──────────────────────────────────────────────────────────────────
  const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
  const SITE_URL          = Deno.env.get('SITE_URL') || 'https://nz-100.vercel.app';

  if (!STRIPE_SECRET_KEY) {
    console.error('[NZ checkout] STRIPE_SECRET_KEY manquante dans les secrets Supabase');
    return jsonErr(500, 'Configuration serveur manquante — contactez l\'administrateur.');
  }

  // ── Création session Stripe ───────────────────────────────────────────────────
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

  try {
    console.log('[NZ checkout] Création session Stripe pour :', offer_type, '—', offer.amount, 'cts');

    const session = await stripe.checkout.sessions.create({
      mode:                 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency:     'eur',
          unit_amount:  offer.amount,
          product_data: {
            name:        offer.label,
            description: 'NZ-100 — Coaching Mathieu Nzita',
          },
        },
        quantity: 1,
      }],
      customer_email: customer_email || undefined,
      metadata: {
        booking_request_id: booking_request_id || '',
        offer_type,
        customer_name:      customer_name || '',
        site:               'nz-100',
      },
      success_url: `${SITE_URL}/${offer.successPage}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${SITE_URL}/${offer.successPage}?payment=cancelled`,
      locale:      'fr',
      expires_at:  Math.floor(Date.now() / 1000) + 30 * 60, // 30 min
    });

    console.log('[NZ checkout] Session créée :', session.id);
    return jsonOk({ url: session.url, session_id: session.id });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur Stripe inconnue';
    console.error('[NZ checkout] Erreur Stripe :', msg);
    return jsonErr(500, `Erreur lors de la création du paiement : ${msg}`);
  }
});
