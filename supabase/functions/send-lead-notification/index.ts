/**
 * NZ 100% — Edge Function : send-lead-notification
 * ─────────────────────────────────────────────────
 * Déclenchée par un Database Webhook sur INSERT dans la table `leads`.
 * Envoie une notification email à Mathieu dès qu'un nouveau lead arrive.
 *
 * DÉPLOIEMENT :
 *   supabase functions deploy send-lead-notification
 *
 * VARIABLES D'ENVIRONNEMENT À CONFIGURER dans Supabase Dashboard
 *   → Settings > Edge Functions > Secrets :
 *   RESEND_API_KEY   → votre clé API Resend (https://resend.com)
 *   ADMIN_EMAIL      → mathieunzita60@gmail.com (email de réception)
 *   FROM_EMAIL       → notifications@nz-100.fr (domaine vérifié dans Resend)
 *
 * WEBHOOK SUPABASE :
 *   Database > Webhooks > Create webhook
 *   Table    : leads
 *   Events   : INSERT
 *   URL      : https://gzrlhvbqdscccqdcklpn.supabase.co/functions/v1/send-lead-notification
 *   Headers  : Authorization: Bearer <service_role_key>
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  message?: string | null;
  program_interest?: string | null;
  status: string;
  created_at: string;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: Lead;
  old_record?: Lead | null;
}

// ─── Handler principal ────────────────────────────────────────────────────────

serve(async (req: Request): Promise<Response> => {
  // Vérification méthode
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Ignorer les événements non-INSERT
  if (payload.type !== 'INSERT' || payload.table !== 'leads') {
    return new Response('Ignored', { status: 200 });
  }

  const lead = payload.record;

  // Récupération des secrets
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const adminEmail   = Deno.env.get('ADMIN_EMAIL') || 'mathieunzita60@gmail.com';
  const fromEmail    = Deno.env.get('FROM_EMAIL')  || 'notifications@nz-100.fr';

  if (!resendApiKey) {
    console.error('[NZ] RESEND_API_KEY manquant — email non envoyé.');
    return new Response('Config error', { status: 500 });
  }

  // Construction de l'email
  const leadDate = new Date(lead.created_at).toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const htmlBody = `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
  .card { background: #000; color: #fff; border-radius: 16px; max-width: 520px; margin: 0 auto; padding: 32px; }
  .logo { font-size: 22px; font-weight: 900; letter-spacing: .08em; margin-bottom: 24px; opacity: .9; }
  h2 { font-size: 20px; margin: 0 0 24px; }
  .field { margin-bottom: 14px; }
  .label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; color: rgba(255,255,255,.45); margin-bottom: 4px; }
  .value { font-size: 15px; color: #fff; word-break: break-all; }
  .divider { border: none; border-top: 1px solid rgba(255,255,255,.1); margin: 20px 0; }
  .cta { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #fff; color: #000; font-weight: 700; font-size: 13px; text-decoration: none; border-radius: 100px; }
  .footer { font-size: 11px; color: rgba(255,255,255,.3); margin-top: 28px; }
</style>
</head>
<body>
<div class="card">
  <div class="logo">NZ 100%</div>
  <h2>🔔 Nouveau lead reçu</h2>

  <div class="field">
    <div class="label">Nom</div>
    <div class="value">${escapeHtml(lead.name)}</div>
  </div>
  <div class="field">
    <div class="label">Email</div>
    <div class="value"><a href="mailto:${escapeHtml(lead.email)}" style="color:#fff;">${escapeHtml(lead.email)}</a></div>
  </div>
  ${lead.phone ? `<div class="field"><div class="label">Téléphone</div><div class="value">${escapeHtml(lead.phone)}</div></div>` : ''}
  ${lead.program_interest ? `<div class="field"><div class="label">Service souhaité</div><div class="value">${escapeHtml(lead.program_interest)}</div></div>` : ''}
  ${lead.message ? `<div class="field"><div class="label">Message</div><div class="value" style="white-space:pre-wrap;">${escapeHtml(lead.message)}</div></div>` : ''}

  <hr class="divider">

  <div class="field">
    <div class="label">Date</div>
    <div class="value" style="font-size:13px;color:rgba(255,255,255,.6);">${leadDate}</div>
  </div>

  <a href="https://nz-100.vercel.app/admin-mathieu.html" class="cta">Voir dans l'admin</a>

  <div class="footer">NZ 100% · Coaching performance · Île-de-France</div>
</div>
</body>
</html>`;

  const textBody = [
    '🔔 NOUVEAU LEAD — NZ 100%',
    '',
    `Nom    : ${lead.name}`,
    `Email  : ${lead.email}`,
    lead.phone ? `Tél    : ${lead.phone}` : '',
    lead.program_interest ? `Service: ${lead.program_interest}` : '',
    lead.message ? `Message: ${lead.message}` : '',
    '',
    `Date   : ${leadDate}`,
    '',
    'Admin  : https://nz-100.vercel.app/admin-mathieu.html',
  ].filter(l => l !== null).join('\n');

  // Envoi via Resend
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `NZ 100% <${fromEmail}>`,
      to: [adminEmail],
      subject: `🔔 Nouveau lead : ${lead.name} — ${lead.program_interest || 'Contact général'}`,
      html: htmlBody,
      text: textBody,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[NZ] Resend error:', err);
    return new Response('Email error', { status: 500 });
  }

  console.log(`[NZ] Email envoyé pour lead ${lead.id} (${lead.email})`);
  return new Response(JSON.stringify({ sent: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
