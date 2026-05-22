# NZ100 — AUDIT SUPABASE PRÉ-INTÉGRATION

Date : 2026-05-20  
Site : https://nz-100.vercel.app/  
Supabase : https://gzrlhvbqdscccqdcklpn.supabase.co

---

## 1. ÉTAT DES FICHIERS HTML

### contact.html
- **Formulaire** : `#contactForm` avec `onsubmit="handleSubmit(event)"`
- **Problème** : aucun `id` ni `name` sur les inputs (prénom, nom, email, téléphone, service, objectif, niveau, disponibilités, message)
- **handleSubmit** : setTimeout fake 1,2s → affiche `#formSuccess`, aucun envoi réel
- **À faire** : ajouter `id` sur tous les champs, insérer dans `leads` via Supabase

### espace-client.html
- **Identique à espace-membre.html** (diff = 0 différence)
- **Décision** : espace-client.html → redirection vers espace-membre.html
- espace-membre.html devient la page finale

### espace-membre.html
- **Auth simulée** :
  - `doLogin()` : lit `#loginEmail` → `enterDashboard(name)` sans vérification
  - `doRegister()` : lit prénom/nom → `enterDashboard(prénom + nom)` sans création compte
  - `doLogout()` : affiche loginScreen sans déconnexion réelle
- **enterDashboard(name)** : cache loginScreen, affiche dashboardScreen, affecte userName/userAvatar
- **sendMsg()** : ajoute bulle dans le DOM + auto-réponse fake après 1,2s
- **playCourseVideo()** : marque item `.done` localement seulement, sans persistance
- **Aucune vérification de session** au chargement de la page

### admin-mathieu.html
- **Auth** : mot de passe hardcodé `'nz100admin'` ou `'admin'` → CRITIQUE
- **KPI** : objet JS statique `var KPI = { semaine: {...}, mois: {...} }`
- **SEANCES** : array JS statique avec 6 entrées mockées
- **CONVS** : array JS statique avec 5 conversations et messages mockés
- **currentConvId** : géré en mémoire locale
- **`initAdmin()`** : pas de fetch Supabase, tout en local

### coaching-basket.html
- **Calendrier local** : `selectedDate`, `selectedCreneau`, `renderCalendar()` — OK côté UX
- **`submitResa()`** : setTimeout fake 1,4s → affiche `#resaSuccess`, aucune insertion DB
- **Pas de vérification d'identité** au moment de la réservation

---

## 2. FONCTIONS À REMPLACER

| Fichier | Fonction | Remplacement |
|---|---|---|
| contact.html | `handleSubmit()` | Insertion dans `leads` via Supabase |
| espace-membre.html | `doLogin()` | `supabase.auth.signInWithPassword()` |
| espace-membre.html | `doRegister()` | `supabase.auth.signUp()` + upsert `profiles` |
| espace-membre.html | `doLogout()` | `supabase.auth.signOut()` |
| espace-membre.html | `enterDashboard()` | Load profile + programmes depuis Supabase |
| espace-membre.html | `sendMsg()` | Insert dans `messages`, fetch thread réel |
| espace-membre.html | `playCourseVideo()` | Upsert dans `content_progress` |
| admin-mathieu.html | `doAdminLogin()` | `supabase.auth.signInWithPassword()` + `requireAdmin()` |
| admin-mathieu.html | `doLogout()` | `supabase.auth.signOut()` |
| admin-mathieu.html | `initAdmin()` | Fetch KPIs, sessions, conversations réelles |
| admin-mathieu.html | `buildConvList()` | Fetch `messages` groupés par client |
| admin-mathieu.html | `sendAdminMsg()` | Insert dans `messages` en tant qu'admin |
| coaching-basket.html | `submitResa()` | Insert dans `booking_requests` |

---

## 3. IDs MANQUANTS — contact.html

Champs sans `id` ni `name` à ajouter :
- Prénom → `id="firstName"`
- Nom → `id="lastName"`
- Email → `id="email"`
- Téléphone → `id="phone"`
- Service (select) → `id="service"`
- Objectif (select) → `id="objective"`
- Niveau (select) → `id="level"`
- Disponibilités → `id="availability"`
- Message (textarea) → `id="message"`

---

## 4. DONNÉES STATIQUES À MIGRER

- **KPI** : à calculer dynamiquement depuis `profiles`, `sessions`, `messages`, `client_programs`
- **SEANCES** : à charger depuis `sessions` avec join `profiles`
- **CONVS** : à charger depuis `messages` groupés par `sender_id` / `receiver_id`

---

## 5. PAGES DOUBLONS

- `espace-client.html` = copie exacte de `espace-membre.html`
- **Action** : espace-client.html → redirect vers espace-membre.html

---

## 6. SÉCURITÉ — POINTS CRITIQUES

| Risque | Niveau | Action |
|---|---|---|
| Mot de passe admin hardcodé `'nz100admin'` | CRITIQUE | Remplacer par auth Supabase + role admin |
| Auth client simulée sans JWT | CRITIQUE | Remplacer par `supabase.auth` |
| Aucun RLS activé | CRITIQUE | Activer sur toutes les tables sensibles |
| `service_role` potentiellement exposable | CRITIQUE | Utiliser uniquement `anon` key côté frontend |

---

## 7. STRUCTURE CIBLE

```
assets/js/supabaseClient.js    ← client partagé
supabase/schema.sql             ← tables + triggers
supabase/policies.sql           ← RLS complet
supabase/seed.sql               ← données initiales
supabase/functions/send-lead-notification/index.ts
```
