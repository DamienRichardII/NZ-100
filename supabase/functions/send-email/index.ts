/**
 * NZ-100 — Edge Function : send-email v4
 * ──────────────────────────────────────────
 * Envoie des emails transactionnels via Resend.
 * RÈGLE : retourne TOUJOURS 200.
 * Erreurs Resend → { sent: false, resend_status, reason } — jamais de 500.
 *
 * Secrets requis :
 *   RESEND_API_KEY  = re_...   (depuis resend.com)
 *   FROM_EMAIL      = contact@nz-100.com  (domaine vérifié Resend)
 *   ADMIN_EMAIL     = mathieunzita60@gmail.com
 *
 * Invocation :
 *   sb.functions.invoke('send-email', { body: { type, to, data } })
 *
 * Types supportés :
 *   - confirmation_compte
 *   - reset_password
 *   - confirmation_paiement
 *   - confirmation_reservation
 *   - paiement_refuse
 *   - rappel_rdv
 *   - notif_admin_reservation
 *   - bilan_confirmation
 *   - bilan_admin
 *   - contact_confirmation   ← NOUVEAU : email client après formulaire contact
 */

interface EmailPayload {
  type: string;
  to: string;
  data?: Record<string, string>;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== 'POST') return jsonError(405, 'Méthode non autorisée');

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  const FROM_EMAIL     = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev';
  const ADMIN_EMAIL    = Deno.env.get('ADMIN_EMAIL') || 'mathieunzita60@gmail.com';

  console.log('[send-email] RESEND_API_KEY:', RESEND_API_KEY ? `présent (${RESEND_API_KEY.length}c)` : '⚠ ABSENT');
  console.log('[send-email] FROM_EMAIL:', FROM_EMAIL, '| ADMIN_EMAIL:', ADMIN_EMAIL);

  if (!RESEND_API_KEY) {
    console.error('[send-email] ✗ RESEND_API_KEY manquante');
    return jsonOk({ sent: false, reason: 'RESEND_API_KEY_MISSING' });
  }

  let payload: EmailPayload;
  try { payload = await req.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const { type, to, data = {} } = payload;
  if (!type || !to) return jsonError(400, 'type et to sont requis');

  console.log('[send-email] type:', type, '| to:', to);

  const template = getTemplate(type, data, ADMIN_EMAIL);
  if (!template) return jsonError(400, `Type d'email inconnu : ${type}`);

  // Destinataires : types admin → ADMIN_EMAIL, tous les autres → to
  const adminOnly = type === 'notif_admin_reservation' || type === 'bilan_admin';
  const recipients = adminOnly ? [ADMIN_EMAIL] : [to];

  console.log('[send-email] ▶ Appel Resend | from:', FROM_EMAIL, '| to:', recipients);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: recipients, subject: template.subject, html: template.html }),
    });

    const resBody = await res.text();
    console.log('[send-email] Resend status:', res.status, '| body:', resBody.slice(0, 400));

    if (!res.ok) {
      console.error('[send-email] ✗ Resend rejeté — status:', res.status, '| body:', resBody.slice(0, 300));
      return jsonOk({ sent: false, resend_status: res.status, resend_error: resBody.slice(0, 300), reason: resendErrorReason(res.status) });
    }

    let result: { id?: string } = {};
    try { result = JSON.parse(resBody); } catch { /* ignore */ }
    console.log('[send-email] ✓ Email envoyé — Resend id:', result.id || '?', '| type:', type, '| to:', to);
    return jsonOk({ sent: true, id: result.id, type, to });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    console.error('[send-email] ✗ Exception réseau Resend:', msg);
    return jsonOk({ sent: false, reason: 'NETWORK_ERROR', error: msg });
  }
});

// ─── Templates ────────────────────────────────────────────────────────────────
function getTemplate(type: string, d: Record<string,string>, _adminEmail: string): { subject: string; html: string } | null {
  const base = (body: string) => `
<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<style>body{font-family:'Helvetica Neue',Arial,sans-serif;background:#0a0a0a;color:#fff;margin:0;padding:0}
.wrap{max-width:560px;margin:0 auto;padding:40px 20px}
.logo{font-size:1.4rem;font-weight:800;letter-spacing:.1em;margin-bottom:32px;color:#fff}
.card{background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.11);border-radius:20px;padding:36px}
h1{font-size:1.6rem;font-weight:700;margin:0 0 12px;line-height:1.2}
p{color:rgba(255,255,255,.7);font-size:.93rem;line-height:1.75;margin:0 0 16px}
.btn{display:inline-block;padding:14px 30px;background:#fff;color:#000;font-weight:700;font-size:.85rem;text-decoration:none;border-radius:100px;letter-spacing:.06em;text-transform:uppercase;margin:16px 0}
.info-row{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.07);font-size:.88rem}
.info-label{color:rgba(255,255,255,.45);min-width:140px}
.info-val{color:#fff;font-weight:500}
.footer{margin-top:32px;font-size:.78rem;color:rgba(255,255,255,.3);text-align:center;line-height:1.7}
.tag{display:inline-block;padding:4px 12px;border-radius:100px;font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
.tag-green{background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.3);color:#4ade80}
.tag-red{background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.3);color:#f87171}
.tag-amber{background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.3);color:#fbbf24}
</style></head>
<body><div class="wrap">
<div class="logo">NZ 100%</div>
<div class="card">${body}</div>
<div class="footer">Mathieu Nzita — Coaching &amp; Performance<br>mathieunzita60@gmail.com — Île-de-France<br><br>Vous recevez cet email car vous avez contacté NZ 100%.</div>
</div></body></html>`;

  switch(type) {

    case 'contact_confirmation': return {
      subject: 'Mathieu a bien reçu ta demande — NZ 100%',
      html: base(`
        <span class="tag tag-green">✓ Demande reçue</span>
        <h1 style="margin-top:16px">C'est bien reçu, ${d.name||''} !</h1>
        <p>Mathieu a bien reçu ta demande pour <strong style="color:#fff">${d.service||'un accompagnement coaching'}</strong>.</p>
        <p>Il te recontacte sous <strong style="color:#fff">24h</strong> avec une proposition adaptée à ton profil et à tes objectifs.</p>
        <p style="color:rgba(255,255,255,.55);font-size:.88rem">En attendant, tu peux télécharger ta roadmap NZ 100% — un guide personnalisé offert par Mathieu pour démarrer dans les meilleures conditions.</p>
        <a href="https://nz-100.com/roadmap.html" class="btn">↓ Télécharger ma roadmap →</a>
        <p style="font-size:.78rem;color:rgba(255,255,255,.35);margin-top:24px">More Discipline — La clé de la liberté.</p>
      `)
    };

    case 'confirmation_compte': return {
      subject: 'Bienvenue dans NZ 100% — Confirmez votre compte',
      html: base(`
        <h1>Bienvenue, ${d.name||''}.</h1>
        <p>Votre compte NZ 100% a été créé avec succès. Cliquez ci-dessous pour confirmer votre adresse email et accéder à votre espace membre.</p>
        <a href="${d.confirm_url||'#'}" class="btn">Confirmer mon compte →</a>
        <p style="font-size:.8rem;color:rgba(255,255,255,.4)">Ce lien expire dans 24h. Si vous n'avez pas créé de compte, ignorez cet email.</p>
      `)
    };

    case 'reset_password': return {
      subject: 'NZ 100% — Réinitialisation de votre mot de passe',
      html: base(`
        <h1>Réinitialisation du mot de passe</h1>
        <p>Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.</p>
        <a href="${d.reset_url||'#'}" class="btn">Changer mon mot de passe →</a>
        <p style="font-size:.8rem;color:rgba(255,255,255,.4)">Ce lien expire dans 1h. Si vous n'avez pas fait cette demande, ignorez cet email — votre mot de passe reste inchangé.</p>
      `)
    };

    case 'confirmation_paiement': return {
      subject: `NZ 100% — Paiement confirmé (${d.amount||''})`,
      html: base(`
        <span class="tag tag-green">✓ Paiement confirmé</span>
        <h1 style="margin-top:16px">Votre paiement a été reçu.</h1>
        <p>Merci ${d.name||''} ! Votre paiement a été traité avec succès.</p>
        <div style="margin:20px 0">
          <div class="info-row"><span class="info-label">Offre</span><span class="info-val">${d.offer||''}</span></div>
          <div class="info-row"><span class="info-label">Montant</span><span class="info-val">${d.amount||''}</span></div>
          <div class="info-row"><span class="info-label">Date</span><span class="info-val">${d.date||new Date().toLocaleDateString('fr-FR')}</span></div>
          <div class="info-row"><span class="info-label">Référence</span><span class="info-val" style="font-size:.8rem;opacity:.7">${d.session_id||''}</span></div>
        </div>
        <p>${d.next_steps||'Mathieu vous contactera sous 24h pour confirmer les prochaines étapes.'}</p>
      `)
    };

    case 'confirmation_reservation': return {
      subject: 'NZ 100% — Votre réservation est confirmée',
      html: base(`
        <span class="tag tag-green">✓ Réservation confirmée</span>
        <h1 style="margin-top:16px">C'est confirmé !</h1>
        <p>Bonjour ${d.name||''}, votre réservation est bien enregistrée. Voici les détails :</p>
        <div style="margin:20px 0">
          <div class="info-row"><span class="info-label">Date</span><span class="info-val">${d.date||''}</span></div>
          <div class="info-row"><span class="info-label">Heure</span><span class="info-val">${d.time||''}</span></div>
          <div class="info-row"><span class="info-label">Type</span><span class="info-val">${d.session_type||'Coaching Basket'}</span></div>
          <div class="info-row"><span class="info-label">Lieu</span><span class="info-val">${d.location||'Adresse envoyée par Mathieu sous 24h'}</span></div>
        </div>
        <p style="font-size:.82rem;color:rgba(255,255,255,.5)">En cas d'empêchement, prévenez Mathieu le plus tôt possible. Annulation la veille : 50% retenus. Annulation le jour J : 100% retenus.</p>
      `)
    };

    case 'paiement_refuse': return {
      subject: 'NZ 100% — Problème avec votre paiement',
      html: base(`
        <span class="tag tag-red">Paiement non abouti</span>
        <h1 style="margin-top:16px">Votre paiement n'a pas pu être traité.</h1>
        <p>Bonjour ${d.name||''}, malheureusement votre tentative de paiement pour <strong>${d.offer||''}</strong> n'a pas abouti.</p>
        <p style="color:rgba(255,255,255,.5)">Cela peut arriver pour plusieurs raisons : fonds insuffisants, limite de carte, ou erreur temporaire. <strong style="color:rgba(255,255,255,.8)">Votre compte n'a pas été débité.</strong></p>
        <a href="${d.retry_url||'https://nz-100.com/tarifs.html'}" class="btn">Réessayer →</a>
        <p style="font-size:.8rem;color:rgba(255,255,255,.4)">Si le problème persiste, contactez votre banque ou écrivez à mathieunzita60@gmail.com.</p>
      `)
    };

    case 'rappel_rdv': return {
      subject: `NZ 100% — Rappel : votre séance ${d.when||'demain'}`,
      html: base(`
        <span class="tag tag-amber">⏰ Rappel</span>
        <h1 style="margin-top:16px">Votre séance est ${d.when||'demain'}.</h1>
        <p>Bonjour ${d.name||''}, voici un rappel pour votre séance de coaching :</p>
        <div style="margin:20px 0">
          <div class="info-row"><span class="info-label">Date</span><span class="info-val">${d.date||''}</span></div>
          <div class="info-row"><span class="info-label">Heure</span><span class="info-val">${d.time||''}</span></div>
          <div class="info-row"><span class="info-label">Lieu</span><span class="info-val">${d.location||''}</span></div>
          <div class="info-row"><span class="info-label">Type</span><span class="info-val">${d.session_type||'Coaching Basket'}</span></div>
        </div>
        <p style="font-size:.82rem;color:rgba(255,255,255,.5)">Arrivez 5 minutes en avance. En cas d'empêchement, contactez Mathieu immédiatement.</p>
      `)
    };

    case 'notif_admin_reservation': return {
      subject: `[NZ Admin] Nouvelle réservation — ${d.client_name||''}`,
      html: base(`
        <h1>Nouvelle réservation reçue</h1>
        <p>Une nouvelle réservation vient d'être enregistrée sur NZ-100.</p>
        <div style="margin:20px 0">
          <div class="info-row"><span class="info-label">Client</span><span class="info-val">${d.client_name||''}</span></div>
          <div class="info-row"><span class="info-label">Email</span><span class="info-val">${d.client_email||''}</span></div>
          <div class="info-row"><span class="info-label">Offre</span><span class="info-val">${d.offer||''}</span></div>
          <div class="info-row"><span class="info-label">Créneau demandé</span><span class="info-val">${d.date||''} ${d.time||''}</span></div>
          <div class="info-row"><span class="info-label">Paiement</span><span class="info-val">${d.payment_status||''}</span></div>
        </div>
        <a href="https://nz-100.com/admin-mathieu.html" class="btn">Gérer dans l'admin →</a>
      `)
    };

    case 'bilan_confirmation': return {
      subject: 'Ton bilan NZ 100% a bien été reçu 🎯',
      html: base(`
        <span class="tag tag-green">✓ Bilan reçu</span>
        <h1 style="margin-top:16px">Bien reçu, ${d.name||''} !</h1>
        <p>Mathieu a bien reçu ton bilan personnalisé. Il l'analyse et te recontacte sous <strong style="color:#fff">24h</strong> pour construire ton programme sur mesure.</p>
        ${d.objectifs ? `<div style="margin:20px 0"><div class="info-row"><span class="info-label">Objectif(s)</span><span class="info-val">${d.objectifs}</span></div></div>` : ''}
        <p style="color:rgba(255,255,255,.6);font-size:.88rem">En attendant, tu peux télécharger ta roadmap NZ 100% ci-dessous — un guide de référence pour démarrer dans les meilleures conditions.</p>
        <a href="${d.roadmap_url||'https://nz-100.com/roadmap.html'}" class="btn">↓ Télécharger ma roadmap →</a>
        <p style="font-size:.8rem;color:rgba(255,255,255,.35);margin-top:20px">More Discipline — La clé de la liberté.</p>
      `)
    };

    case 'bilan_admin': return {
      subject: `[NZ Admin] Nouveau bilan — ${d.name||'Inconnu'}`,
      html: base(`
        <h1>Nouveau bilan reçu</h1>
        <p>Un nouveau bilan vient d'être soumis sur NZ-100.</p>
        <div style="margin:20px 0">
          <div class="info-row"><span class="info-label">Nom</span><span class="info-val">${d.name||''}</span></div>
          <div class="info-row"><span class="info-label">Email</span><span class="info-val">${d.email||''}</span></div>
          <div class="info-row"><span class="info-label">Téléphone</span><span class="info-val">${d.telephone||'—'}</span></div>
          <div class="info-row"><span class="info-label">Âge</span><span class="info-val">${d.age||'—'}</span></div>
          <div class="info-row"><span class="info-label">Niveau</span><span class="info-val">${d.niveau||'—'}</span></div>
          <div class="info-row"><span class="info-label">Objectif(s)</span><span class="info-val">${d.objectifs||'—'}</span></div>
          <div class="info-row"><span class="info-label">Engagement</span><span class="info-val">${d.engagement||'—'}/10</span></div>
          <div class="info-row"><span class="info-label">Lieu</span><span class="info-val">${d.lieu||'—'}</span></div>
          <div class="info-row"><span class="info-label">Attentes</span><span class="info-val" style="font-size:.82rem">${d.attentes||'—'}</span></div>
        </div>
        <a href="https://nz-100.com/admin-mathieu.html" class="btn">Voir dans l'admin →</a>
      `)
    };

    default: return null;
  }
}

function resendErrorReason(status: number): string {
  switch (status) {
    case 401: return 'RESEND_INVALID_API_KEY';
    case 403: return 'RESEND_FORBIDDEN';
    case 422: return 'RESEND_DOMAIN_NOT_VERIFIED_OR_BAD_FROM';
    case 429: return 'RESEND_RATE_LIMIT';
    default:  return `RESEND_HTTP_${status}`;
  }
}

function jsonOk(data: object): Response {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
}
function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
}
function corsHeaders(): Record<string,string> {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info' };
}
