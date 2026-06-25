/**
 * NZ-100 — Edge Function : send-lead-notification v3
 * ─────────────────────────────────────────────────────
 * RÈGLE : retourne TOUJOURS 200.
 * Erreurs Resend → { sent: false, resend_status, reason } — jamais de 502/503.
 */

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  };
}
function jsonOk(data: object): Response {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
}
function jsonErr(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
}

interface LeadData {
  first_name?: string; last_name?: string; name?: string;
  email: string; phone?: string | null; message?: string | null;
  program_interest?: string | null; objective?: string | null; created_at?: string;
}
interface DirectPayload  { mode: 'direct'; lead: LeadData; }
interface WebhookPayload { type: 'INSERT'|'UPDATE'|'DELETE'; table: string; record: LeadData & { id: string; status: string; created_at: string }; }

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') { console.log('[lead-notif] OPTIONS OK'); return new Response(null, { status: 204, headers: corsHeaders() }); }
  if (req.method !== 'POST') return jsonErr(405, 'Méthode non autorisée');

  console.log('[lead-notif] ▶ Entrée POST');

  let body: DirectPayload | WebhookPayload;
  try { body = await req.json(); }
  catch { console.error('[lead-notif] ✗ JSON invalide'); return jsonErr(400, 'JSON invalide'); }

  let lead: LeadData;
  if ('mode' in body && body.mode === 'direct') {
    lead = body.lead;
    if (!lead?.email) { console.error('[lead-notif] ✗ email manquant'); return jsonErr(400, 'email requis'); }
    console.log('[lead-notif] Mode direct | email:', lead.email, '| service:', lead.program_interest || '—');
  } else if ('type' in body) {
    const wb = body as WebhookPayload;
    if (wb.type !== 'INSERT' || wb.table !== 'leads') { console.log('[lead-notif] Webhook ignoré'); return jsonOk({ ignored: true }); }
    lead = wb.record;
    console.log('[lead-notif] Mode webhook | email:', lead.email);
  } else {
    console.error('[lead-notif] ✗ payload inconnu:', JSON.stringify(body).slice(0,200));
    return jsonErr(400, 'Format payload non reconnu.');
  }

  if (!lead.email) return jsonErr(400, 'Email requis.');

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const adminEmail   = Deno.env.get('ADMIN_EMAIL') || 'mathieunzita60@gmail.com';
  const fromEmail    = Deno.env.get('FROM_EMAIL')  || 'onboarding@resend.dev';

  console.log('[lead-notif] RESEND_API_KEY:', resendApiKey ? `présent (${resendApiKey.length}c)` : '⚠ ABSENT');
  console.log('[lead-notif] FROM_EMAIL:', fromEmail, '| ADMIN_EMAIL:', adminEmail);

  if (!resendApiKey) {
    console.error('[lead-notif] ✗ RESEND_API_KEY manquante');
    return jsonOk({ sent: false, reason: 'RESEND_API_KEY_MISSING' });
  }

  const firstName = lead.first_name || (lead.name ? lead.name.split(' ')[0] : '') || '';
  const lastName  = lead.last_name  || (lead.name ? lead.name.split(' ').slice(1).join(' ') : '') || '';
  const fullName  = [firstName, lastName].filter(Boolean).join(' ') || 'Inconnu';
  const leadDate  = lead.created_at
    ? new Date(lead.created_at).toLocaleString('fr-FR', { timeZone:'Europe/Paris', weekday:'long', day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })
    : new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  const htmlBody = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}.card{background:#000;color:#fff;border-radius:16px;max-width:520px;margin:0 auto;padding:32px}.logo{font-size:22px;font-weight:900;letter-spacing:.08em;margin-bottom:24px}.field{margin-bottom:14px}.label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.45);margin-bottom:4px}.value{font-size:15px;color:#fff;word-break:break-all}hr{border:none;border-top:1px solid rgba(255,255,255,.1);margin:20px 0}.cta{display:inline-block;margin-top:20px;padding:12px 24px;background:#fff;color:#000;font-weight:700;font-size:13px;text-decoration:none;border-radius:100px}.footer{font-size:11px;color:rgba(255,255,255,.3);margin-top:28px}</style>
</head><body><div class="card">
<div class="logo">NZ 100%</div><h2>🔔 Nouveau lead reçu</h2>
<div class="field"><div class="label">Nom</div><div class="value">${esc(fullName)}</div></div>
<div class="field"><div class="label">Email</div><div class="value"><a href="mailto:${esc(lead.email)}" style="color:#fff">${esc(lead.email)}</a></div></div>
${lead.phone ? `<div class="field"><div class="label">Téléphone</div><div class="value">${esc(lead.phone)}</div></div>` : ''}
${lead.program_interest ? `<div class="field"><div class="label">Service</div><div class="value">${esc(lead.program_interest)}</div></div>` : ''}
${lead.objective ? `<div class="field"><div class="label">Objectif</div><div class="value">${esc(lead.objective)}</div></div>` : ''}
${lead.message ? `<div class="field"><div class="label">Message</div><div class="value" style="white-space:pre-wrap">${esc(lead.message)}</div></div>` : ''}
<hr><div class="field"><div class="label">Date</div><div class="value" style="font-size:13px;color:rgba(255,255,255,.6)">${leadDate}</div></div>
<a href="https://nz-100.vercel.app/admin-mathieu.html" class="cta">Voir dans l'admin →</a>
<div class="footer">NZ 100% · Île-de-France</div>
</div></body></html>`;

  console.log('[lead-notif] ▶ Appel Resend | from:', fromEmail, '| to:', adminEmail);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    `NZ 100% <${fromEmail}>`,
        to:      [adminEmail],
        subject: `🔔 Nouveau lead : ${fullName} — ${lead.program_interest || 'Contact général'}`,
        html:    htmlBody,
        text:    `LEAD NZ 100%\nNom: ${fullName}\nEmail: ${lead.email}${lead.phone?'\nTél: '+lead.phone:''}${lead.program_interest?'\nService: '+lead.program_interest:''}${lead.message?'\nMessage: '+lead.message:''}\nDate: ${leadDate}`,
      }),
    });

    const resBody = await res.text();
    console.log('[lead-notif] Resend status:', res.status, '| body:', resBody.slice(0, 400));

    if (!res.ok) {
      console.error('[lead-notif] ✗ Resend rejeté — status:', res.status, '| reason:', resendErrorReason(res.status), '| body:', resBody);
      return jsonOk({ sent: false, resend_status: res.status, resend_error: resBody.slice(0, 300), reason: resendErrorReason(res.status) });
    }

    let resJson: { id?: string } = {};
    try { resJson = JSON.parse(resBody); } catch { /* ignore */ }
    console.log('[lead-notif] ✓ Email envoyé — Resend id:', resJson.id || '?');
    return jsonOk({ sent: true, resend_id: resJson.id });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[lead-notif] ✗ Exception réseau Resend:', msg);
    return jsonOk({ sent: false, reason: 'NETWORK_ERROR', error: msg });
  }
});

function resendErrorReason(status: number): string {
  switch (status) {
    case 401: return 'RESEND_INVALID_API_KEY';
    case 403: return 'RESEND_FORBIDDEN';
    case 422: return 'RESEND_DOMAIN_NOT_VERIFIED_OR_BAD_FROM';
    case 429: return 'RESEND_RATE_LIMIT';
    default:  return `RESEND_HTTP_${status}`;
  }
}

function esc(s?: string | null): string {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
