# NZ 100% — Rapport d'intégration Supabase
**Date** : Mai 2026 · **Projet** : https://nz-100.vercel.app · **Supabase** : https://gzrlhvbqdscccqdcklpn.supabase.co

---

## ✅ Ce qui a été fait

### Phase 1 — Audit
- Toutes les fonctions mock identifiées dans `contact.html`, `espace-membre.html`, `coaching-basket.html`, `admin-mathieu.html`
- Vulnérabilité critique détectée : mot de passe admin codé en dur (`nz100admin`) → **supprimé**
- Décision : `espace-client.html` redirige vers `espace-membre.html`

### Phase 2 — Base de données (`supabase/schema.sql`)
Tables créées avec RLS :
- `profiles` — extension de `auth.users`
- `leads` — formulaires de contact
- `programs` + `program_modules` + `program_contents` — catalogue de programmes
- `client_programs` + `content_progress` — suivi client
- `messages` — messagerie Mathieu ↔ client
- `booking_requests` — réservations basket

### Phase 3 — Politiques RLS (`supabase/policies.sql`)
- Fonction `is_admin()` basée sur `profiles.role = 'admin'` (jamais sur un mot de passe)
- Leads : insertion publique, lecture/écriture admin seulement
- Messages : client voit ses messages, admin voit tout
- Booking_requests : insertion publique, admin gère les statuts

### Phase 4 — Seed data (`supabase/seed.sql`)
5 programmes insérés :
- NZ Perte de Poids (12 semaines, 299€)
- NZ Remise en Forme (8 semaines, 249€)
- NZ Retour au Sport (10 semaines, 349€)
- NZ Performance (16 semaines, 399€)
- NZ Basket (8 semaines, 199€)

Modules et contenus placeholder pour démarrer.

### Phase 5 — Client JavaScript (`assets/js/supabaseClient.js`)
Helpers disponibles via `window.NZ` :
```
NZ.getCurrentUser()          → auth user ou null
NZ.getCurrentProfile()       → profil complet ou null
NZ.requireAuth()             → redirige si non connecté
NZ.requireAdmin()            → redirige si non admin
NZ.signUpClient(email, pwd, name)
NZ.signInClient(email, pwd)
NZ.signOutClient()
NZ.insertLead({ name, email, phone, message, program_interest })
NZ.sendMessage(clientId, content, sender)
NZ.fetchMessages(clientId)
NZ.markMessagesRead(clientId)
NZ.subscribeToMessages(clientId, callback)  → Realtime
NZ.fetchClientPrograms(userId)
NZ.fetchProgramModules(programId)
NZ.fetchContentProgress(clientProgramId)
NZ.markContentDone(clientProgramId, contentId)
NZ.submitBookingRequest({ name, email, phone, session_type, preferred_date, message })
NZ.fetchAdminDashboard()
NZ.updateLeadStatus(leadId, status)
NZ.updateBookingStatus(bookingId, status)
NZ.assignProgramToClient(clientId, programId)
```

### Phase 6 — contact.html
- IDs ajoutés à tous les champs (`cf-prenom`, `cf-email`, `cf-service`, `cf-message`...)
- `handleSubmit()` mock → `nzHandleContact()` avec `NZ.insertLead()`
- Div `#formError` pour feedback utilisateur
- Fallback si Supabase non configuré (mode dégradé visible)

### Phase 7 — espace-membre.html
- `doLogin()` mock → `NZ.signInClient()` réel
- `doRegister()` mock → `NZ.signUpClient()` réel
- `doLogout()` mock → `NZ.signOutClient()` réel
- Auto-détection de session au chargement (`initAuth()`)
- Messagerie `sendMsg()` connectée à `NZ.sendMessage()`
- Div `#authError` pour messages d'erreur
- `espace-client.html` → redirect vers `espace-membre.html`

### Phase 8 — coaching-basket.html
- `submitResa()` mock → `NZ.submitBookingRequest()` réel
- Construction automatique du message complet (âge, niveau, poste, club)
- Date ISO pour `preferred_date`
- Fallback mode démo si Supabase non configuré

### Phase 9 — admin-mathieu.html
- Mot de passe codé en dur supprimé
- Connexion via email + mot de passe (`NZ.signInClient()`)
- Vérification du rôle `admin` après connexion (RLS côté serveur + JS côté client)
- Auto-détection de session au chargement
- KPIs chargés depuis Supabase (`NZ.fetchAdminDashboard()`)
- Leads récents et réservations en attente affichés dynamiquement
- Donut logout fonctionnel via `NZ.signOutClient()`

### Phase 10 — Edge Function (`supabase/functions/send-lead-notification/index.ts`)
- Webhook Database sur `leads` INSERT
- Email HTML + texte envoyé à Mathieu via **Resend**
- Variables d'env : `RESEND_API_KEY`, `ADMIN_EMAIL`, `FROM_EMAIL`

---

## 🚀 Checklist de déploiement (dans l'ordre)

### Étape 1 — Supabase Dashboard

1. **SQL Editor → Exécuter `supabase/schema.sql`** (tables + triggers + enums)
2. **SQL Editor → Exécuter `supabase/policies.sql`** (RLS + is_admin())
3. **SQL Editor → Exécuter `supabase/seed.sql`** (programmes + contenus)

### Étape 2 — Récupérer la clé anon

1. Dashboard Supabase → **Settings > API**
2. Copier `anon public` key
3. Ouvrir `assets/js/supabaseClient.js`
4. Remplacer `YOUR_SUPABASE_ANON_KEY` par la vraie clé

### Étape 3 — Créer le compte admin Mathieu

1. Dashboard Supabase → **Authentication > Users > Invite user**
2. Email : `mathieunzita60@gmail.com`
3. Après inscription, **SQL Editor** :
```sql
UPDATE profiles SET role = 'admin' WHERE id = (
  SELECT id FROM auth.users WHERE email = 'mathieunzita60@gmail.com'
);
```

### Étape 4 — Edge Function (notifications email)

1. Créer un compte sur [resend.com](https://resend.com) (gratuit)
2. Vérifier le domaine `nz-100.fr` (ou utiliser l'email de test Resend)
3. Dashboard Supabase → **Settings > Edge Functions > Secrets** → ajouter :
   - `RESEND_API_KEY` = votre clé Resend
   - `ADMIN_EMAIL` = `mathieunzita60@gmail.com`
   - `FROM_EMAIL` = `notifications@nz-100.fr` (ou domaine Resend vérifié)
4. Déployer la fonction (si Supabase CLI installé) :
```bash
supabase login
supabase link --project-ref gzrlhvbqdscccqdcklpn
supabase functions deploy send-lead-notification
```
5. Dashboard → **Database > Webhooks > Create webhook** :
   - Table : `leads` · Événement : `INSERT`
   - URL : `https://gzrlhvbqdscccqdcklpn.supabase.co/functions/v1/send-lead-notification`
   - Header : `Authorization: Bearer <votre_service_role_key>`

### Étape 5 — Déployer le site

```bash
# Si Vercel CLI
vercel --prod

# Ou pousser sur GitHub → déploiement automatique Vercel
git add .
git commit -m "feat: intégration Supabase complète"
git push
```

---

## 🔒 Règles de sécurité (immuables)

| Règle | Statut |
|-------|--------|
| Jamais la `service_role` key côté frontend | ✅ |
| Uniquement `anon key` dans `supabaseClient.js` | ✅ |
| RLS activé sur toutes les tables sensibles | ✅ |
| Vérification `is_admin()` côté serveur | ✅ |
| Mot de passe admin codé en dur supprimé | ✅ |
| Données client protégées par `auth.uid()` | ✅ |
| Aucun mock data dans les zones connectées | ✅ (fallback démo uniquement) |

---

## 📁 Fichiers créés / modifiés

```
nz100/
├── supabase/
│   ├── schema.sql                          ✅ créé (213 lignes)
│   ├── policies.sql                        ✅ créé (205 lignes)
│   ├── seed.sql                            ✅ créé (230 lignes)
│   └── functions/
│       └── send-lead-notification/
│           └── index.ts                   ✅ créé (190 lignes)
├── assets/
│   └── js/
│       └── supabaseClient.js              ✅ créé (463 lignes)
├── contact.html                           ✅ modifié (IDs + insertLead)
├── espace-membre.html                     ✅ modifié (auth réelle)
├── espace-client.html                     ✅ redirect → espace-membre.html
├── coaching-basket.html                   ✅ modifié (submitBookingRequest)
├── admin-mathieu.html                     ✅ modifié (sécurisé + KPIs live)
└── NZ100_SUPABASE_RAPPORT_FINAL.md        ✅ ce fichier
```

---

## ⚡ Mode dégradé (fallback)

Si Supabase n'est pas encore configuré (clé anon non renseignée), toutes les pages fonctionnent en **mode dégradé** :
- Les formulaires affichent le succès sans envoyer de données
- Un `console.warn('[NZ] Supabase non configuré — mode démo')` est loggé
- Aucune erreur visible pour l'utilisateur
- Ce mode est uniquement destiné au développement local

---

*Rapport généré automatiquement — NZ 100% Backend Integration May 2026*
