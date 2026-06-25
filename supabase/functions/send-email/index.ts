/**
 * NZ-100 — Edge Function : send-email v7
 * ──────────────────────────────────────────────────────────────────────
 * Emails transactionnels NZ100 via Resend.
 * RÈGLE : toujours 200. Erreurs Resend → { sent: false }.
 * v7 : styles 100% inline — robustesse dark mode Gmail / iPhone.
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

  console.log('[send-email] v7 | KEY:', RESEND_API_KEY ? `ok(${RESEND_API_KEY.length}c)` : '⚠ ABSENT');
  if (!RESEND_API_KEY) return jsonOk({ sent: false, reason: 'RESEND_API_KEY_MISSING' });

  let payload: EmailPayload;
  try { payload = await req.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const { type, to, data = {} } = payload;
  if (!type || !to) return jsonError(400, 'type et to requis');
  console.log('[send-email] type:', type, '| to:', to);

  const template = getTemplate(type, data, ADMIN_EMAIL);
  if (!template) return jsonError(400, `Type inconnu: ${type}`);

  const adminOnly = type === 'notif_admin_reservation' || type === 'bilan_admin';
  const recipients = adminOnly ? [ADMIN_EMAIL] : [to];

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: recipients, subject: template.subject, html: template.html }),
    });
    const resBody = await res.text();
    console.log('[send-email] Resend status:', res.status, '| body:', resBody.slice(0, 200));
    if (!res.ok) return jsonOk({ sent: false, resend_status: res.status, reason: resendErrorReason(res.status) });
    let result: { id?: string } = {};
    try { result = JSON.parse(resBody); } catch { /**/ }
    console.log('[send-email] ✓ envoyé | id:', result.id, '| type:', type);
    return jsonOk({ sent: true, id: result.id, type, to });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    console.error('[send-email] ✗ Exception:', msg);
    return jsonOk({ sent: false, reason: 'NETWORK_ERROR', error: msg });
  }
});

/* ═══ HELPERS ══════════════════════════════════════════════════════════════ */
function corsHeaders(): Record<string,string> {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  };
}
function jsonOk(d: object): Response {
  return new Response(JSON.stringify(d), { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
}
function jsonError(s: number, m: string): Response {
  return new Response(JSON.stringify({ error: m }), { status: s, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
}
function resendErrorReason(s: number): string {
  return s === 401 ? 'INVALID_API_KEY' : s === 422 ? 'DOMAIN_NOT_VERIFIED' : s === 429 ? 'RATE_LIMIT' : `HTTP_${s}`;
}
function esc(s?: string | null): string {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ═══ TEMPLATE BASE — 100% inline styles, dark mode robuste ═══════════════ */
function base(body: string): string {
  return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>NZ 100%</title>
</head>
<body style="margin:0;padding:0;background-color:#0d0d0d;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#0d0d0d;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;">

      <!-- LOGO -->
      <tr><td style="padding-bottom:24px;">
        <span style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:900;letter-spacing:0.08em;color:#ffffff;">NZ 100%</span>
      </td></tr>

      <!-- CARD -->
      <tr><td style="background-color:#161616;border:1px solid rgba(255,255,255,0.10);border-radius:20px;padding:36px 32px;">
        ${body}
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="padding-top:28px;text-align:center;">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#666666;line-height:1.7;">
          Mathieu Nzita — Coaching &amp; Performance<br>
          <a href="mailto:mathieunzita60@gmail.com" style="color:#888888;text-decoration:none;">mathieunzita60@gmail.com</a> — Île-de-France<br><br>
          Vous recevez cet email car vous avez contacté NZ 100%.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/* Bouton CTA email-safe (table-based, robuste iPhone/Gmail/Outlook) */
function btn(href: string, label: string): string {
  return `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:20px 0 8px;">
  <tr>
    <td align="center" bgcolor="#ffffff" style="border-radius:100px;background-color:#ffffff;">
      <a href="${href}" target="_blank" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#000000;text-decoration:none;padding:14px 30px;border-radius:100px;letter-spacing:0.05em;background-color:#ffffff;mso-padding-alt:14px 30px;">${label}</a>
    </td>
  </tr>
</table>`;
}

/* Tag coloré */
function tag(cls: 'green'|'red'|'amber', label: string): string {
  const styles: Record<string,string> = {
    green: 'background-color:#0f2e1a;border:1px solid #1a5c35;color:#4ade80;',
    red:   'background-color:#2e0f0f;border:1px solid #5c1a1a;color:#f87171;',
    amber: 'background-color:#2e260f;border:1px solid #5c4a1a;color:#fbbf24;',
  };
  return `<span style="display:inline-block;padding:4px 12px;border-radius:100px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;${styles[cls]}">${label}</span>`;
}

/* Ligne info-row */
function row(label: string, val: string): string {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.07);font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#999999;width:140px;vertical-align:top;">${label}</td>
    <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.07);font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#ffffff;font-weight:600;vertical-align:top;">${val}</td>
  </tr>`;
}

/* ═══ TEMPLATES ════════════════════════════════════════════════════════════ */
function getTemplate(type: string, d: Record<string,string>, _adminEmail: string): { subject: string; html: string } | null {

  switch (type) {

    case 'contact_confirmation': return {
      subject: 'Mathieu a bien reçu ta demande — NZ 100%',
      html: base(`
        ${tag('green', '✓ Demande reçue')}
        <h1 style="margin:16px 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2;">C'est bien reçu, ${esc(d.name)} !</h1>
        <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#cccccc;line-height:1.75;">Mathieu a bien reçu ta demande pour <strong style="color:#ffffff;">${esc(d.service||'un accompagnement coaching')}</strong>.</p>
        <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#cccccc;line-height:1.75;">Il te recontacte sous <strong style="color:#ffffff;">24h</strong> avec une proposition adaptée à ton profil et à tes objectifs.</p>
        <p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#999999;line-height:1.75;">En attendant, tu peux télécharger ta roadmap NZ 100% — un guide personnalisé offert par Mathieu pour démarrer dans les meilleures conditions.</p>
        ${btn('https://nz-100.com/roadmap.html', '↓ Télécharger ma roadmap →')}
        <p style="margin:20px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#555555;">More Discipline — La clé de la liberté.</p>
      `),
    };

    case 'confirmation_compte': return {
      subject: 'Bienvenue dans NZ 100% — Confirmez votre compte',
      html: base(`
        <h1 style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2;">Bienvenue, ${esc(d.name)} !</h1>
        <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#cccccc;line-height:1.75;">Votre compte NZ 100% a été créé. Cliquez ci-dessous pour confirmer votre adresse email.</p>
        ${btn(d.confirm_url||'#', 'Confirmer mon compte →')}
        <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#666666;">Ce lien expire dans 24h.</p>
      `),
    };

    case 'reset_password': return {
      subject: 'NZ 100% — Réinitialisation de votre mot de passe',
      html: base(`
        <h1 style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2;">Réinitialisation du mot de passe</h1>
        <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#cccccc;line-height:1.75;">Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous.</p>
        ${btn(d.reset_url||'#', 'Changer mon mot de passe →')}
        <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#666666;">Ce lien expire dans 1h.</p>
      `),
    };

    case 'confirmation_paiement': return {
      subject: `NZ 100% — Paiement confirmé (${esc(d.amount)})`,
      html: base(`
        ${tag('green', '✓ Paiement confirmé')}
        <h1 style="margin:16px 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2;">Votre paiement a été reçu.</h1>
        <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#cccccc;line-height:1.75;">Merci ${esc(d.name)} ! Votre paiement a été traité avec succès.</p>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;">
          ${row('Offre', esc(d.offer))}
          ${row('Montant', esc(d.amount))}
          ${row('Date', esc(d.date||new Date().toLocaleDateString('fr-FR')))}
          ${d.session_id ? row('Référence', esc(d.session_id)) : ''}
        </table>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#cccccc;line-height:1.75;">${esc(d.next_steps||'Mathieu vous contactera sous 24h pour confirmer les prochaines étapes.')}</p>
      `),
    };

    case 'confirmation_reservation': return {
      subject: 'NZ 100% — Votre réservation est confirmée',
      html: base(`
        ${tag('green', '✓ Réservation confirmée')}
        <h1 style="margin:16px 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2;">C'est confirmé !</h1>
        <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#cccccc;line-height:1.75;">Bonjour ${esc(d.name)}, votre réservation est bien enregistrée.</p>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;">
          ${row('Date', esc(d.date))}
          ${row('Heure', esc(d.time))}
          ${row('Type', esc(d.session_type||'Coaching Basket'))}
          ${row('Lieu', esc(d.location||'Adresse envoyée par Mathieu sous 24h'))}
        </table>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#888888;line-height:1.7;">Annulation la veille : 50% retenus. Annulation le jour J : 100% retenus.</p>
      `),
    };

    case 'paiement_refuse': return {
      subject: 'NZ 100% — Problème avec votre paiement',
      html: base(`
        ${tag('red', 'Paiement non abouti')}
        <h1 style="margin:16px 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2;">Votre paiement n'a pas abouti.</h1>
        <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#cccccc;line-height:1.75;">Bonjour ${esc(d.name)}, votre tentative pour <strong style="color:#ffffff;">${esc(d.offer)}</strong> n'a pas abouti. Votre compte n'a pas été débité.</p>
        ${btn(d.retry_url||'https://nz-100.com/tarifs.html', 'Réessayer →')}
        <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#666666;">Si le problème persiste, contactez votre banque ou écrivez à mathieunzita60@gmail.com.</p>
      `),
    };

    case 'rappel_rdv': return {
      subject: `NZ 100% — Rappel : votre séance ${esc(d.when||'demain')}`,
      html: base(`
        ${tag('amber', '⏰ Rappel')}
        <h1 style="margin:16px 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2;">Votre séance est ${esc(d.when||'demain')}.</h1>
        <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#cccccc;line-height:1.75;">Bonjour ${esc(d.name)}, voici un rappel pour votre séance :</p>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;">
          ${row('Date', esc(d.date))}
          ${row('Heure', esc(d.time))}
          ${row('Lieu', esc(d.location))}
          ${row('Type', esc(d.session_type||'Coaching Basket'))}
        </table>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#888888;">Arrivez 5 minutes en avance. En cas d'empêchement, contactez Mathieu immédiatement.</p>
      `),
    };

    case 'notif_admin_reservation': return {
      subject: `[NZ Admin] Nouvelle réservation — ${esc(d.client_name)}`,
      html: base(`
        <h1 style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2;">Nouvelle réservation reçue</h1>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;">
          ${row('Client', esc(d.client_name))}
          ${row('Email', esc(d.client_email))}
          ${row('Offre', esc(d.offer))}
          ${row('Créneau', esc(`${d.date||''} ${d.time||''}`.trim()))}
          ${row('Paiement', esc(d.payment_status))}
        </table>
        ${btn('https://nz-100.com/admin-mathieu.html', 'Gérer dans l\'admin →')}
      `),
    };

    case 'bilan_confirmation': return {
      subject: 'Ton bilan NZ 100% a bien été reçu 🎯',
      html: base(`
        ${tag('green', '✓ Bilan reçu')}
        <h1 style="margin:16px 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2;">Bien reçu, ${esc(d.name)} !</h1>
        <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#cccccc;line-height:1.75;">Mathieu a bien reçu ton bilan. Il l'analyse et te recontacte sous <strong style="color:#ffffff;">24h</strong> pour construire ton programme sur mesure.</p>
        ${d.objectifs ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;">${row('Objectif(s)', esc(d.objectifs))}</table>` : ''}
        <p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#999999;line-height:1.75;">En attendant, télécharge ta roadmap NZ 100% — un guide de référence offert par Mathieu.</p>
        ${btn(d.roadmap_url||'https://nz-100.com/roadmap.html', '↓ Télécharger ma roadmap →')}
        <p style="margin:20px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#555555;">More Discipline — La clé de la liberté.</p>
      `),
    };

    case 'bilan_admin': return {
      subject: `[NZ Admin] Nouveau bilan reçu — ${esc(d.name)}`,
      html: base(`
        <h1 style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2;">Nouveau bilan client</h1>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;">
          ${row('Nom', esc(d.name))}
          ${row('Email', esc(d.email))}
          ${d.phone   ? row('Téléphone', esc(d.phone))   : ''}
          ${d.objectifs ? row('Objectifs', esc(d.objectifs)) : ''}
          ${d.programme ? row('Programme', esc(d.programme)) : ''}
          ${d.niveau  ? row('Niveau', esc(d.niveau))     : ''}
        </table>
        ${btn('https://nz-100.com/admin-mathieu.html', 'Voir dans l\'admin →')}
      `),
    };

    default: return null;
  }
}
