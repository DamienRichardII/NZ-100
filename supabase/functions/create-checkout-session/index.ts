/**
 * NZ-100 — Edge Function : create-checkout-session
 * ─────────────────────────────────────────────────
 * Crée une session Stripe Checkout côté serveur.
 * La clé secrète Stripe n'est JAMAIS exposée au frontend.
 *
 * Secrets Supabase requis (Project Settings → Edge Functions → Secrets) :
 *   STRIPE_SECRET_KEY   = sk_live_...  (ou sk_test_... en dev)
 *   SITE_URL            = https://nz-100.vercel.app
 *
 * Invocation depuis le frontend :
 *   const { data, error } = await window.NZ._sb.functions.invoke('create-checkout-session', {
 *     body: { booking_request_id, offer_type, customer_email, customer_name }
 *   });
 *   if (data?.url) window.location.href = data.url;
 *
 * Déploiement :
 *   supabase functions deploy create-checkout-session --no-verify-jwt
 */

import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno';

// ─── Types ────────────────────────────────────────────────────────
interface CheckoutPayload {
  booking_request_id?: string;
  offer_type: 'coaching_basket_acompte' | 'coaching_basket_full' | 'bilan';
  customer_email?: string;
  customer_name?: string;
}

// ─── Montants en centimes ─────────────────────────────────────────
const OFFER_AMOUNTS: Record<string, { amount: number; label: string }> = {
  coaching_basket_acompte: {
    amount: 3000,  // 30 € acompte
    label: 'Coaching basket — acompte de réservation (30 €)',
  },
  coaching_basket_full: {
    amount: 7000,  // 70 € séance complète (60€ + 10€ stadium)
    label: 'Coaching basket individuel — séance complète (70 €)',
  },
  bilan: {
    amount: 0,
    label: 'Bilan Forme & Performance (offert)',
  },
};

// ─── Handler ─────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  // CORS préflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return jsonError(405, 'Méthode non autorisée');
  }

  // ── Lecture du payload ──────────────────────────────────────────
  let payload: CheckoutPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonError(400, 'JSON invalide');
  }

  const { booking_request_id, offer_type, customer_email, customer_name } = payload;

  // ── Validation du type d'offre ──────────────────────────────────
  if (!offer_type || !(offer_type in OFFER_AMOUNTS)) {
    return jsonError(400, `offer_type invalide. Valeurs acceptées : ${Object.keys(OFFER_AMOUNTS).join(', ')}`);
  }

  const offer = OFFER_AMOUNTS[offer_type];

  // Bilan = gratuit, pas de Checkout Stripe
  if (offer.amount === 0) {
    return jsonSuccess({ url: null, message: 'Offre gratuite — aucun paiement requis' });
  }

  // ── Secrets ────────────────────────────────────────────────────
  const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
  const SITE_URL = Deno.env.get('SITE_URL') || 'https://nz-100.vercel.app';

  if (!STRIPE_SECRET_KEY) {
    console.error('[NZ] STRIPE_SECRET_KEY manquante — configurer dans Supabase Secrets');
    return jsonError(500, 'Configuration Stripe manquante');
  }

  // ── Création session Stripe Checkout ───────────────────────────
  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
  });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: offer.amount,
            product_data: {
              name: offer.label,
              description: 'NZ-100 — Coaching Mathieu Nzita',
            },
          },
          quantity: 1,
        },
      ],
      customer_email: customer_email || undefined,
      metadata: {
        booking_request_id: booking_request_id || '',
        offer_type,
        customer_name: customer_name || '',
        site: 'nz-100',
      },
      success_url: `${SITE_URL}/coaching-basket.html?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/coaching-basket.html?payment=cancelled`,
      locale: 'fr',
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // expire dans 30 min
    });

    console.log('[NZ] Session Stripe créée :', session.id, '— offer:', offer_type, '— booking:', booking_request_id);

    return jsonSuccess({ url: session.url, session_id: session.id });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur Stripe inconnue';
    console.error('[NZ] Erreur Stripe Checkout :', message);
    return jsonError(500, `Erreur Stripe : ${message}`);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────
function jsonSuccess(data: object): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: corsHeaders('application/json'),
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: corsHeaders('application/json'),
  });
}

function corsHeaders(contentType: string): HeadersInit {
  return {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
