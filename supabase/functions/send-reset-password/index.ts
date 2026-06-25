/**
 * NZ-100 — Edge Function : send-reset-password v1
 * ─────────────────────────────────────────────────────────────────
 * Génère un lien de reset via l'Admin API Supabase (service_role)
 * et envoie un email 100% brandé NZ100 via Resend.
 * RÈGLE : retourne TOUJOURS 200 (ne jamais révéler si l'email existe).
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), {
      status: 405, headers: corsHeaders(),
    });
  }

  let body: { email?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const email = (body.email || '').trim().toLowerCase();
  console.log('[reset-pwd] ▶ Demande reset | email:', email || '(vide)');

  if (!email || !email.includes('@')) {
    return jsonOk({ sent: false, reason: 'INVALID_EMAIL' });
  }

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendApiKey   = Deno.env.get('RESEND_API_KEY');
  const fromEmail      = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev';

  console.log('[reset-pwd] RESEND_API_KEY:', resendApiKey ? `présent (${resendApiKey.length}c)` : '⚠ ABSENT');

  if (!resendApiKey) {
    console.error('[reset-pwd] ✗ RESEND_API_KEY manquante');
    return jsonOk({ sent: false, reason: 'RESEND_API_KEY_MISSING' });
  }

  // ── 1. Générer le lien de reset via l'Admin API ──────────────────
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
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
      // Sécurité : retourner sent:true même si l'email n'existe pas
      return jsonOk({ sent: true });
    }

    resetLink = (linkData as any)?.properties?.action_link || '';
    if (!resetLink) {
      console.error('[reset-pwd] ✗ action_link vide — linkData:', JSON.stringify(linkData).slice(0, 200));
      return jsonOk({ sent: true });
    }
    console.log('[reset-pwd] ✓ action_link généré (tronqué):', resetLink.slice(0, 70) + '...');
  } catch (ex) {
    const msg = ex instanceof Error ? ex.message : String(ex);
    console.error('[reset-pwd] ✗ Exception generateLink:', msg);
    return jsonOk({ sent: true });
  }

  // ── 2. Email brandé NZ100 ────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;background:#f0f0f0;padding:28px 16px}
  .wrap{max-width:520px;margin:0 auto}
  .card{background:#0a0a0a;border-radius:20px;overflow:hidden}
  .top{background:#fff;padding:20px 30px;display:flex;align-items:center;gap:10px}
  .logo{font-size:18px;font-weight:900;letter-spacing:.06em;color:#000;font-family:Arial,sans-serif}
  .body{padding:36px 30px 30px}
  .tag{display:inline-block;padding:5px 14px;border-radius:100px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:rgba(255,255,255,.5);margin-bottom:22px}
  h1{font-size:24px;font-weight:800;color:#fff;margin-bottom:14px;line-height:1.25}
  p{color:rgba(255,255,255,.58);font-size:13.5px;line-height:1.82;margin-bottom:10px}
  strong{color:#fff}
  .btn{display:inline-block;margin-top:26px;margin-bottom:6px;padding:14px 34px;background:#fff;color:#000;font-weight:800;font-size:13.5px;text-decoration:none;border-radius:100px;letter-spacing:.02em}
  hr{border:none;border-top:1px solid rgba(255,255,255,.08);margin:26px 0}
  .notice{font-size:11px;color:rgba(255,255,255,.28);line-height:1.75}
  .notice a{color:rgba(255,255,255,.38);word-break:break-all}
  .footer{padding:18px 30px;font-size:10.5px;color:rgba(255,255,255,.22)}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="top">
      <div class="logo">NZ 100%</div>
    </div>
    <div class="body">
      <div class="tag">🔐 Réinitialisation</div>
      <h1>Réinitialise ton mot de passe</h1>
      <p>Tu as demandé à réinitialiser le mot de passe de ton compte <strong>NZ 100%</strong>.</p>
      <p>Clique sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien est valable <strong>1 heure</strong> et ne peut être utilisé qu'une seule fois.</p>
      <a href="${resetLink}" class="btn">Choisir un nouveau mot de passe →</a>
      <hr>
      <p class="notice">
        Si tu n'as pas demandé cette réinitialisation, ignore cet email — ton mot de passe reste inchangé et ton compte est sécurisé.<br><br>
        Lien de réinitialisation (copie-colle si le bouton ne fonctionne pas) :<br>
        <a href="${resetLink}">${resetLink}</a>
      </p>
    </div>
    <div class="footer">NZ 100% · Île-de-France · nz-100.com</div>
  </div>
</div>
</body>
</html>`;

  console.log('[reset-pwd] ▶ Appel Resend | to:', email, '| from:', fromEmail);

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
        text: `NZ 100% — Réinitialise ton mot de passe\n\nClique sur le lien ci-dessous pour choisir un nouveau mot de passe (valable 1h) :\n\n${resetLink}\n\nSi tu n'as pas fait cette demande, ignore cet email.`,
      }),
    });

    const resText = await resRes.text();
    console.log('[reset-pwd] Resend status:', resRes.status, '| body:', resText.slice(0, 200));

    if (resRes.ok) {
      resSent = true;
      console.log('[reset-pwd] ✓ Email reset envoyé à:', email);
    } else {
      console.error('[reset-pwd] ✗ Resend error:', resRes.status, resText.slice(0, 200));
    }
  } catch (ex) {
    const msg = ex instanceof Error ? ex.message : String(ex);
    console.error('[reset-pwd] ✗ Exception Resend:', msg);
  }

  // Toujours retourner sent:true côté client (sécurité — pas d'énumération d'emails)
  return jsonOk({ sent: true, _resend: resSent });
});
