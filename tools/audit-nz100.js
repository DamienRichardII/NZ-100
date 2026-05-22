#!/usr/bin/env node
/**
 * NZ-100 — Script d'audit anti-régression
 * Exécuter depuis la racine du projet : node tools/audit-nz100.js
 * Génère PASS / WARN / FAIL par fichier et par règle.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RESET = '\x1b[0m', RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', BOLD = '\x1b[1m', CYAN = '\x1b[36m';

let totalPass = 0, totalWarn = 0, totalFail = 0;

function pass(msg)  { console.log(`  ${GREEN}✅ PASS${RESET}  ${msg}`); totalPass++; }
function warn(msg)  { console.log(`  ${YELLOW}⚠️  WARN${RESET}  ${msg}`); totalWarn++; }
function fail(msg)  { console.log(`  ${RED}❌ FAIL${RESET}  ${msg}`); totalFail++; }

function read(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) { fail(`Fichier absent : ${file}`); return null; }
  return fs.readFileSync(p, 'utf-8');
}

// ── Règles ───────────────────────────────────────────────────────────────────

const RULES = {

  // 1. Tous les HTML se terminent par </html>
  notTruncated: (content, file) => {
    const last = content.trimEnd().slice(-7);
    if (last === '</html>') pass(`${file} — non tronqué`);
    else fail(`${file} — TRONQUÉ (fin: "${last.replace(/\n/g,'\\n')}")`);
  },

  // 2. Pas de CDN Supabase tronqué
  noCdnTruncated: (content, file) => {
    if (/supabase\.mi[^n]/.test(content))
      fail(`${file} — CDN Supabase tronqué (supabase.mi... sans .js)`);
    else
      pass(`${file} — CDN Supabase non tronqué`);
  },

  // 3. Pas de placeholder de clé anon
  noAnonPlaceholder: (content, file) => {
    if (/YOUR_SUPABASE_ANON_KEY/.test(content))
      fail(`${file} — Placeholder clé anon présent (YOUR_SUPABASE_ANON_KEY)`);
    else
      pass(`${file} — Pas de placeholder clé anon`);
  },

  // 4. Pas de service_role key exposée (hors commentaires)
  noServiceRole: (content, file) => {
    const lines = content.split('\n');
    const hits = lines.filter((l,i) => /service_role/.test(l) && !/^\s*(\/\/|\*|#)/.test(l));
    if (hits.length > 0) fail(`${file} — service_role trouvé hors commentaires (${hits.length} ligne(s))`);
    else pass(`${file} — Pas de service_role exposé`);
  },

  // 5. Pas de faux succès setTimeout
  noFakeSuccess: (content, file) => {
    if (/setTimeout\s*\(\s*.*[Ss]uccess/.test(content) || /setTimeout\s*\(\s*show[Ss]uccess/.test(content))
      fail(`${file} — setTimeout(showSuccess...) détecté — faux succès probable`);
    else
      pass(`${file} — Pas de faux succès setTimeout`);
  },

  // 6. Pas de mode démo
  noModeDemo: (content, file) => {
    if (/mode démo|mode demo/i.test(content))
      fail(`${file} — "mode démo" trouvé — fallback non-production présent`);
    else
      pass(`${file} — Pas de mode démo`);
  },

  // 7. Pas de .select().single() après un insert public (insertLead ou booking)
  noPublicSelectSingle: (content, file) => {
    if (/\.insert\s*\(.*\)\s*\n?\s*\.select\s*\(\s*\)\s*\n?\s*\.single\s*\(\s*\)/.test(content))
      fail(`${file} — .insert().select().single() détecté — risque permission denied pour anon`);
    else
      pass(`${file} — Pas de .select().single() après insert`);
  },

  // 8. Apostrophes françaises dans strings JS single-quote (messages d'erreur uniquement)
  noFrenchApostropheInJsString: (content, file) => {
    const lines = content.split('\n');
    const dangerous = [];
    lines.forEach((line, i) => {
      // Chercher les patterns comme showAuthError('...l'...')  ou  textContent = '...d'...'
      if (/(?:showAuthError|showError|textContent|\.warn|\.error|\.log|alert)\s*\(?\s*['"]/.test(line)) {
        // Vérifier si une string single-quoted contient une apostrophe française
        const singleQ = line.match(/'([^']*(?:l'|d'|n'|j'|s'|c'|m'|qu')[^']*)'/);
        if (singleQ) dangerous.push(`  ligne ${i+1}: ${line.trim().slice(0,80)}`);
      }
    });
    if (dangerous.length > 0) {
      fail(`${file} — Apostrophe française dans string JS single-quote :`);
      dangerous.forEach(d => console.log(`    ${RED}${d}${RESET}`));
    } else {
      pass(`${file} — Pas d'apostrophe dangereuse dans les strings JS`);
    }
  },

  // 9. Ordre de chargement Supabase (CDN avant supabaseClient.js avant script métier)
  supabaseLoadOrder: (content, file) => {
    // Chercher uniquement dans les balises <script src> pour éviter les faux positifs (console.error, commentaires)
    const cdnPos    = content.indexOf('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js');
    const clientPos = content.search(/<script src="[^"]*supabaseClient\.js/);
    const scriptPos = content.indexOf('<script>');
    if (cdnPos === -1 && clientPos === -1) return; // page sans Supabase
    if (cdnPos === -1) { warn(`${file} — CDN supabase.min.js absent dans les balises script`); return; }
    if (clientPos === -1) { warn(`${file} — supabaseClient.js absent dans les balises script`); return; }
    if (cdnPos > clientPos) fail(`${file} — CDN supabase chargé APRÈS supabaseClient.js`);
    else if (scriptPos !== -1 && scriptPos < cdnPos) {
      // Il y a un <script> inline AVANT le CDN — vérifier s'il utilise window.NZ en IIFE
      const firstScriptContent = content.slice(scriptPos, cdnPos).slice(0, 800);
      if (/\(async function/.test(firstScriptContent) && /window\.NZ/.test(firstScriptContent))
        warn(`${file} — Script inline avec IIFE window.NZ avant le CDN`);
      else
        pass(`${file} — Ordre Supabase : CDN → supabaseClient.js ✓ (script inline = fonctions seulement)`);
    } else {
      pass(`${file} — Ordre Supabase : CDN → supabaseClient.js → script inline ✓`);
    }
  },

  // 10. Cache bust sur supabaseClient.js (pages critiques)
  cacheBust: (content, file) => {
    const match = content.match(/<script src="[^"]*supabaseClient\.js(\?v=[^\s"']+)?"/);
    if (!match) return; // pas de tag supabaseClient sur cette page
    if (!match[1]) warn(`${file} — supabaseClient.js sans version cache bust (?v=...)`);
    else pass(`${file} — Cache bust présent : ${match[1]}`);
  },

  // 11. </body></html> présents
  hasBodyClose: (content, file) => {
    if (!content.includes('</body>')) fail(`${file} — </body> manquant`);
    else if (!content.includes('</html>')) fail(`${file} — </html> manquant`);
    else pass(`${file} — </body></html> présents`);
  },
};

// ── Fichiers à auditer ────────────────────────────────────────────────────────

const HTML_FILES = [
  'index.html', 'contact.html', 'espace-membre.html', 'espace-client.html',
  'admin-mathieu.html', 'coaching-basket.html', 'remise-en-forme.html',
  'retour-au-sport.html', 'performance.html', 'mon-histoire.html', 'tarifs.html'
];

const CRITICAL_FILES = ['contact.html', 'espace-membre.html', 'admin-mathieu.html', 'coaching-basket.html'];
const JS_FILE = 'assets/js/supabaseClient.js';

// ── Exécution ────────────────────────────────────────────────────────────────

console.log(`\n${BOLD}${CYAN}════════════════════════════════════════════════${RESET}`);
console.log(`${BOLD}${CYAN}  NZ-100 — Audit Anti-Régression${RESET}`);
console.log(`${BOLD}${CYAN}════════════════════════════════════════════════${RESET}\n`);

// HTML pages — toutes règles
for (const file of HTML_FILES) {
  const content = read(file);
  if (!content) continue;
  console.log(`${BOLD}── ${file} ──${RESET}`);
  RULES.notTruncated(content, file);
  RULES.hasBodyClose(content, file);
  RULES.noCdnTruncated(content, file);
  RULES.noAnonPlaceholder(content, file);
  RULES.noServiceRole(content, file);
  RULES.noFakeSuccess(content, file);
  RULES.noModeDemo(content, file);
  RULES.noPublicSelectSingle(content, file);
  RULES.noFrenchApostropheInJsString(content, file);
  RULES.supabaseLoadOrder(content, file);
  if (CRITICAL_FILES.includes(file)) RULES.cacheBust(content, file);
  console.log('');
}

// supabaseClient.js
const jsContent = read(JS_FILE);
if (jsContent) {
  console.log(`${BOLD}── ${JS_FILE} ──${RESET}`);
  RULES.noAnonPlaceholder(jsContent, JS_FILE);
  RULES.noServiceRole(jsContent, JS_FILE);
  RULES.noFakeSuccess(jsContent, JS_FILE);
  RULES.noModeDemo(jsContent, JS_FILE);
  RULES.noPublicSelectSingle(jsContent, JS_FILE);
  if (!/NZ_SUPABASE_URL\s*=\s*'https:\/\/gzrlhvbqdscccqdcklpn\.supabase\.co'/.test(jsContent))
    fail(`${JS_FILE} — URL Supabase incorrecte ou absente`);
  else
    pass(`${JS_FILE} — URL Supabase correcte`);
  if (!/NZ_SUPABASE_ANON\s*=\s*'eyJ/.test(jsContent))
    fail(`${JS_FILE} — Clé anon absente ou ne commence pas par eyJ`);
  else
    pass(`${JS_FILE} — Clé anon présente (commence par eyJ)`);
  console.log('');
}

// ── Résumé ────────────────────────────────────────────────────────────────────
console.log(`${BOLD}${CYAN}════════════════════════════════════════════════${RESET}`);
console.log(`${BOLD}  RÉSUMÉ${RESET}`);
console.log(`  ${GREEN}PASS : ${totalPass}${RESET}`);
console.log(`  ${YELLOW}WARN : ${totalWarn}${RESET}`);
console.log(`  ${RED}FAIL : ${totalFail}${RESET}`);
if (totalFail === 0 && totalWarn === 0) {
  console.log(`\n  ${GREEN}${BOLD}🎉 Audit complet — aucun problème détecté.${RESET}`);
} else if (totalFail === 0) {
  console.log(`\n  ${YELLOW}${BOLD}⚠️  Warnings à corriger avant push.${RESET}`);
} else {
  console.log(`\n  ${RED}${BOLD}❌ ${totalFail} erreur(s) critique(s) — corriger avant push.${RESET}`);
}
console.log(`${BOLD}${CYAN}════════════════════════════════════════════════${RESET}\n`);

process.exit(totalFail > 0 ? 1 : 0);
