/**
 * NZ-100 — Edge Function : send-lead-notification v2
 * ─────────────────────────────────────────────────────
 * Deux modes de déclenchement :
 *
 *   1. APPEL DIRECT depuis le front (contact.html)
 *      POST avec body : { mode: 'direct', lead: { first_name, last_name, email, phone, message, program_interest } }
 *      → CORS autorisé
 *
 *   2. DATABASE WEBHOOK Supabase (INSERT sur la table `leads`)
 *      POST avec body : { type: 'INSERT', table: 'leads', record: {...} }
 *      → CORS non requis (appel serveur→serveur)
 *
 * Secrets requis (Project Settings → Edge Functions → Secrets) :
 *   RESEND_API_KEY  = re_...
 *   ADMIN_EMAIL     = mathieunzita60@gmail.com
 *   FROM_EMAIL      = noreply@nz-100.fr
 */

// ─── CORS headers (pour les appels directs depuis le front) ───────────────────
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

// ─── Types ────────────────────────────────────────────────────────────────────
interface LeadData {
  first_name?:      string;
  last_name?:       string;
  name?:            string;   // compat descendante
  email:            string;
  phone?:           string | null;
  message?:         string | null;
  program_interest?: string | null;
  objective?:       string | null;
  created_at?:      string;
}

interface DirectPayload {
  mode: 'direct';
  lead: LeadData;
}

interface WebhookPayload {
  type:   'INSERT' | 'UPDATE' | 'DELETE';
  table:  string;
  record: LeadData & { id: string; status: string; created_at: string };
}

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {

  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    console.log('[NZ lead-notif] OPTIONS preflight OK');
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== 'POST') return jsonErr(405, 'Méthode non autorisée');

  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: DirectPayload | WebhookPayload;
  try {
    body = await req.json();
  } catch {
    console.error('[NZ lead-notif] JSON invalide');
    return jsonErr(400, 'JSON invalide');
  }

  // ── Extraire les données du lead selon le mode ────────────────────────────────
  let lead: LeadData;

  if ('mode' in body && body.mode === 'direct') {
    // Appel direct depuis le front
    lead = body.lead;
    if (!lead?.email) return jsonErr(400, 'Champ email requis dans lead.');
    console.log('[NZ lead-notif] Mode direct — email:', lead.email);
  } else if ('type' in body) {
    // DB Webhook Supabase
    const webhookBody = body as WebhookPayload;
    if (webhookBody.type !== 'INSERT' || webhookBody.table !== 'leads') {
      console.log('[NZ lead-notif] Webhook ignoré — type:', webhookBody.type, 'table:', webhookBody.table);
      return jsonOk({ ignored: true });
    }
    lead = webhookBody.record;
    console.log('[NZ lead-notif] Mode webhook — email:', lead.email);
  } else {
    return jsonErr(400, 'Format de payload non reconnu. Attendu : { mode: "direct", lead: {...} } ou webhook Supabase.');
  }

  if (!lead.email) return jsonErr(400, 'Email du lead requis.');

  // ── Secrets ───────────────────────────────────────────────────────────────────
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const adminEmail   = Deno.env.get('ADMIN_EMAIL') || 'mathieunzita60@gmail.com';
  const fromEmail    = Deno.env.get('FROM_EMAIL')  || 'notifications@nz-100.fr';

  if (!resendApiKey) {
    console.error('[NZ lead-notif] RESEND_API_KEY manquante');
    return jsonErr(500, 'Configuration email manquante — RESEND_API_KEY absent.');
  }

  // ── Construire le nom ─────────────────────────────────────────────────────────
  const firstName = lead.first_name || (lead.name ? lead.name.split(' ')[0] : '') || '';
  const lastName  = lead.last_name  || (lead.name ? lead.name.split(' ').slice(1).join(' ') : '') || '';
  const fullName  = [firstName, lastName].filter(Boolean).join(' ') || 'Inconnu';

  // ── Date ─────────────────────────────────────────────────────────────────────
  const leadDate = lead.created_at
    ? new Date(lead.created_at).toLocaleString('fr-FR', {
        timeZone: 'Europe/Paris',
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  // ── Email HTML ────────────────────────────────────────────────────────────────
  const htmlBody = `
<!DOCTYPE html><html lang="fr">
<head><meta charset="UTF-8">
<style>
body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
.card{background:#000;color:#fff;border-radius:16px;max-width:520px;margin:0 auto;padding:32px}
.logo{font-size:22px;font-weight:900;letter-spacing:.08em;margin-bottom:24px;opacity:.9}
h2{font-size:20px;margin:0 0 24px}
.field{margin-bottom:14px}
.label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.45);margin-bottom:4px}
.value{font-size:15px;color:#fff;word-break:break-all}
hr{border:none;border-top:1px solid rgba(255,255,255,.1);margin:20px 0}
.cta{display:inline-block;margin-top:20px;padding:12px 24px;background:#fff;color:#000;font-weight:700;font-size:13px;text-decoration:none;border-radius:100px}
.footer{font-size:11px;color:rgba(255,255,255,.3);margin-top:28px}
</style></head>
<body><div class="card">
<div class="logo">NZ 100%</div>
<h2>🔔 Nouveau lead reçu</h2>
<div class="field"><div class="label">Nom</div><div class="value">${esc(fullName)}</div></div>
<div class="field"><div class="label">Email</div><div class="value"><a href="mailto:${esc(lead.email)}" style="color:#fff">${esc(lead.email)}</a></div></div>
${lead.phone ? `<div class="field"><div class="label">Téléphone</div><div class="value">${esc(lead.phone)}</div></div>` : ''}
${lead.program_interest ? `<div class="field"><div class="label">Service souhaité</div><div class="value">${esc(lead.program_interest)}</div></div>` : ''}
${lead.objective ? `<div class="field"><div class="label">Objectif</div><div class="value">${esc(lead.objective)}</div></div>` : ''}
${lead.message ? `<div class="field"><div class="label">Message</div><div class="value" style="white-space:pre-wrap">${esc(lead.message)}</div></div>` : ''}
<hr>
<div class="field"><div class="label">Date</div><div class="value" style="font-size:13px;color:rgba(255,255,255,.6)">${leadDate}</div></div>
<a href="https://nz-100.vercel.app/admin-mathieu.html" class="cta">Voir dans l'admin →</a>
<div class="footer">NZ 100% · Coaching performance · Île-de-France</div>
</div></body></html>`;

  // ── Envoi Resend ──────────────────────────────────────────────────────────────
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    `NZ 100% <${fromEmail}>`,
        to:      [adminEmail],
        subject: `🔔 Nouveau lead : ${fullName} — ${lead.program_interest || 'Contact général'}`,
        html:    htmlBody,
        text:    `NOUVEAU LEAD NZ 100%\n\nNom: ${fullName}\nEmail: ${lead.email}${lead.phone ? '\nTél: ' + lead.phone : ''}${lead.program_interest ? '\nService: ' + lead.program_interest : ''}${lead.message ? '\nMessage: ' + lead.message : ''}\n\nDate: ${leadDate}\nAdmin: https://nz-100.vercel.app/admin-mathieu.html`,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[NZ lead-notif] Resend erreur HTTP', res.status, ':', errText);
      return jsonErr(502, `Email service error (${res.status}) — lead bien enregistré.`);
    }

    const resJson = await res.json();
    console.log('[NZ lead-notif] Email envoyé avec succès — Resend id:', resJson.id);
    return jsonOk({ sent: true, resend_id: resJson.id });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    console.error('[NZ lead-notif] Exception Resend:', msg);
    return jsonErr(503, `Impossible de joindre le service email : ${msg}`);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function esc(s?: string | null): string {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
