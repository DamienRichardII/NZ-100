/**
 * NZ-100 — Edge Function : send-reset-password v2
 * ──────────────────────────────────────────────────────────────────
 * Génère un lien de reset via l'Admin API Supabase (service_role)
 * + envoie un email NZ100 via Resend.
 * v2 : bouton table-based email-safe (Gmail/iPhone/Safari/Outlook)
 *      + styles 100% inline — robustesse dark mode.
 * RÈGLE : toujours 200 (ne pas révéler si l'email existe).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== 'POST') return new Response(
    JSON.stringify({ error: 'Méthode non autorisée' }),
    { status: 405, headers: corsHeaders() }
  );

  let body: { email?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const email = (body.email || '').trim().toLowerCase();
  console.log('[reset-pwd] v2 | email:', email || '(vide)');

  if (!email || !email.includes('@')) return jsonOk({ sent: false, reason: 'INVALID_EMAIL' });

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendApiKey   = Deno.env.get('RESEND_API_KEY');
  const fromEmail      = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev';

  console.log('[reset-pwd] RESEND_API_KEY:', resendApiKey ? `ok(${resendApiKey.length}c)` : '⚠ ABSENT');
  if (!resendApiKey) return jsonOk({ sent: false, reason: 'RESEND_API_KEY_MISSING' });

  // ── 1. Générer le lien de reset via Admin API ─────────────────────────
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let resetLink = '';
  try {
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: 'https://nz-100.com/reset-password.html' },
    });

    if (linkErr) {
      console.error('[reset-pwd] ✗ generateLink error:', linkErr.message);
      return jsonOk({ sent: true }); // sécurité : toujours sent:true
    }

    resetLink = (linkData as any)?.properties?.action_link || '';
    if (!resetLink) {
      console.error('[reset-pwd] ✗ action_link vide');
      return jsonOk({ sent: true });
    }
    console.log('[reset-pwd] ✓ link généré:', resetLink.slice(0, 60) + '...');
  } catch (ex) {
    console.error('[reset-pwd] ✗ Exception generateLink:', ex instanceof Error ? ex.message : ex);
    return jsonOk({ sent: true });
  }

  // ── 2. Email NZ100 — styles 100% inline + bouton table-based ─────────
  const html = buildResetEmail(resetLink);

  console.log('[reset-pwd] ▶ Resend | to:', email, '| from:', fromEmail);

  let resSent = false;
  try {
    const resRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    `Mathieu · NZ 100% <${fromEmail}>`,
        to:      [email],
        subject: '🔐 Réinitialise ton mot de passe — NZ 100%',
        html,
        text: `NZ 100% — Réinitialise ton mot de passe\n\nClique sur le lien ci-dessous (valable 1h) :\n\n${resetLink}\n\nSi tu n'as pas fait cette demande, ignore cet email.`,
      }),
    });

    const resText = await resRes.text();
    console.log('[reset-pwd] Resend status:', resRes.status);
    if (resRes.ok) {
      resSent = true;
      console.log('[reset-pwd] ✓ email envoyé à:', email);
    } else {
      console.error('[reset-pwd] ✗ Resend error:', resRes.status, resText.slice(0, 200));
    }
  } catch (ex) {
    console.error('[reset-pwd] ✗ Exception Resend:', ex instanceof Error ? ex.message : ex);
  }

  return jsonOk({ sent: true, _resend: resSent });
});

/* ═══ HTML EMAIL ══════════════════════════════════════════════════════════ */
function buildResetEmail(resetLink: string): string {
  return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>NZ 100% — Réinitialisation mot de passe</title>
</head>
<body style="margin:0;padding:0;background-color:#0d0d0d;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">

<!-- WRAPPER TABLE -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
       style="background-color:#0d0d0d;">
  <tr><td align="center" style="padding:32px 16px;">

    <!-- CONTENT TABLE -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
           style="max-width:540px;">

      <!-- LOGO -->
      <tr>
        <td style="padding-bottom:22px;">
          <span style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:900;
                       letter-spacing:0.08em;color:#ffffff;">NZ 100%</span>
        </td>
      </tr>

      <!-- CARD -->
      <tr>
        <td style="background-color:#161616;border:1px solid #2a2a2a;border-radius:20px;
                   padding:36px 32px;">

          <!-- TAG -->
          <p style="margin:0 0 20px;">
            <span style="display:inline-block;padding:4px 14px;border-radius:100px;
                         background-color:#1a1a2e;border:1px solid #2a2a4a;
                         font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;
                         letter-spacing:0.14em;text-transform:uppercase;color:#8888ff;">
              🔐 Réinitialisation
            </span>
          </p>

          <!-- TITRE -->
          <h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:24px;
                     font-weight:800;color:#ffffff;line-height:1.25;">
            Réinitialise ton mot de passe
          </h1>

          <!-- TEXTE 1 -->
          <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;
                    color:#cccccc;line-height:1.8;">
            Tu as demandé à réinitialiser le mot de passe de ton compte
            <strong style="color:#ffffff;">NZ 100%</strong>.
          </p>

          <!-- TEXTE 2 -->
          <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;
                    color:#cccccc;line-height:1.8;">
            Clique sur le bouton ci-dessous pour choisir un nouveau mot de passe.
            Ce lien est valable <strong style="color:#ffffff;">1 heure</strong>
            et ne peut être utilisé qu'une seule fois.
          </p>

          <!-- BOUTON TABLE-BASED (bulletproof Gmail/iPhone/Outlook) -->
          <table role="presentation" border="0" cellpadding="0" cellspacing="0"
                 style="margin:0 0 8px;">
            <tr>
              <td align="center" bgcolor="#ffffff"
                  style="border-radius:100px;background-color:#ffffff;">
                <a href="${resetLink}"
                   target="_blank"
                   style="display:inline-block;
                          font-family:Arial,Helvetica,sans-serif;
                          font-size:14px;
                          font-weight:800;
                          color:#000000;
                          text-decoration:none;
                          padding:14px 32px;
                          border-radius:100px;
                          letter-spacing:0.04em;
                          background-color:#ffffff;
                          border:2px solid #ffffff;
                          mso-padding-alt:14px 32px;">
                  Choisir un nouveau mot de passe →
                </a>
              </td>
            </tr>
          </table>

          <!-- SÉPARATEUR -->
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
                 style="margin:28px 0;">
            <tr>
              <td style="border-top:1px solid #2a2a2a;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
          </table>

          <!-- NOTICE -->
          <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;
                    color:#666666;line-height:1.75;">
            Si tu n'as pas demandé cette réinitialisation, ignore cet email —
            ton mot de passe reste inchangé et ton compte est sécurisé.
          </p>

          <!-- LIEN FALLBACK -->
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;
                    color:#555555;line-height:1.75;">
            Si le bouton ne fonctionne pas, copie-colle ce lien dans ton navigateur :<br>
            <a href="${resetLink}"
               style="color:#7777cc;word-break:break-all;font-size:11px;">${resetLink}</a>
          </p>

        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="padding-top:28px;text-align:center;">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;
                    color:#555555;line-height:1.7;">
            NZ 100% · Île-de-France ·
            <a href="https://nz-100.com" style="color:#666666;text-decoration:none;">nz-100.com</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}
