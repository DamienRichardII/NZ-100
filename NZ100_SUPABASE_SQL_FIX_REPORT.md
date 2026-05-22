# NZ 100% — Rapport de correction SQL
**Date** : Mai 2026 · **Erreur initiale** : `ERROR: 42703: column "client_id" does not exist`

---

## Erreur initiale

```
Error: Failed to run sql query:
ERROR: 42703: column "client_id" does not exist
```

Lors de l'exécution de `supabase/schema.sql` dans le SQL Editor Supabase, sur la ligne :
```sql
create index if not exists idx_cp_client_id on content_progress(client_id);
```

---

## Cause racine

L'erreur `column "client_id" does not exist` signifie que Supabase avait déjà une version ancienne de la table `content_progress` créée à partir des requêtes sauvegardées dans le panneau gauche du SQL Editor ("Content Progress Tracking", etc.). Cette ancienne table utilisait `client_program_id` au lieu de `client_id`.

Quand `schema.sql` a tenté d'ajouter l'index, la table existante n'avait pas de colonne `client_id` → erreur.

---

## Inventaire complet des incohérences corrigées (10)

| # | Table | Ancienne colonne / problème | Correction |
|---|-------|---------------------------|-----------|
| 1 | `profiles` | `first_name` + `last_name` séparés | → `full_name text` (correspond au JS `signUpClient`) |
| 2 | `leads` | `first_name` + `last_name` + `service` | → `name text` + `program_interest text` (correspond au JS `insertLead`) |
| 3 | `programs` | Pas de `subtitle`, `price_eur`, `duration_weeks` | → 3 colonnes ajoutées (seed.sql en avait besoin) |
| 4 | `client_programs` | `is_active boolean`, pas de `status`, `started_at`, `progress_pct` | → `status text default 'active'` + `started_at` + `progress_pct int` |
| 5 | `content_progress` | `completed boolean` + JS utilisait `client_program_id` | → `is_done boolean` + JS corrigé pour utiliser `client_id` |
| 6 | `messages` | Enum `message_sender` + colonne `sender_type` OK mais JS envoyait `{sender, content, read_at}` | → JS corrigé : `{sender_type, body, is_read}` |
| 7 | `sessions` | `scheduled_at timestamptz` + `service_type` | → `session_date date` + `start_time time` + `end_time time` + `service text` |
| 8 | `booking_requests` | `first_name` + `last_name` + `requested_slot` + JS envoyait `{session_type, preferred_date}` | → `name text` + `requested_time text` + JS mappé `service` + split date/time |
| 9 | `content_type` | Enum `'texte'` mais seed.sql insérait `'text'` | → Colonne `text` (plus d'enum) |
| 10 | Index sessions | `idx_sessions_scheduled on sessions(scheduled_at)` colonne supprimée | → `idx_sessions_date on sessions(session_date)` |

---

## Fichiers corrigés

| Fichier | Statut |
|---------|--------|
| `supabase/schema.sql` | ✅ Réécrit (v2 — 250 lignes) |
| `supabase/policies.sql` | ✅ Réécrit (v2 — 223 lignes) |
| `assets/js/supabaseClient.js` | ✅ Réécrit (v2 — 498 lignes) |
| `admin-mathieu.html` | ✅ `_renderPendingBookings` corrigé |
| `NZ-100-ADMIN/index.html` | ✅ `_renderPendingBookings` corrigé |
| `supabase/seed.sql` | ✅ Aucun changement nécessaire (déjà correct) |
| `contact.html` | ✅ Aucun changement nécessaire |
| `coaching-basket.html` | ✅ Aucun changement nécessaire |
| `espace-membre.html` | ✅ Aucun changement nécessaire |

---

## Procédure de reset Supabase (si tables déjà partiellement créées)

⚠️ **À exécuter UNIQUEMENT si des tables existent déjà avec une structure incorrecte.**
Ne pas mettre dans un fichier de déploiement standard.

```sql
-- RESET COMPLET — supprime tout et repart de zéro
-- À exécuter dans SQL Editor Supabase avant schema.sql

drop table if exists public.content_progress   cascade;
drop table if exists public.client_programs    cascade;
drop table if exists public.program_contents   cascade;
drop table if exists public.program_modules    cascade;
drop table if exists public.programs           cascade;
drop table if exists public.messages           cascade;
drop table if exists public.sessions           cascade;
drop table if exists public.booking_requests   cascade;
drop table if exists public.leads              cascade;
drop table if exists public.profiles           cascade;

-- Supprimer les fonctions
drop function if exists public.is_admin()          cascade;
drop function if exists public.set_updated_at()    cascade;
drop function if exists public.handle_new_user()   cascade;

-- Supprimer le trigger sur auth.users
drop trigger if exists trg_on_auth_user_created on auth.users;
```

Ensuite exécuter dans l'ordre :
1. `supabase/schema.sql`
2. `supabase/policies.sql`
3. `supabase/seed.sql`

---

## Convention finale retenue

| Concept | Colonne | Type | Table(s) |
|---------|---------|------|---------|
| Identifiant client | `client_id` | `uuid → profiles.id` | client_programs, content_progress, messages, sessions, booking_requests |
| Expéditeur message | `sender_id` | `uuid → auth.users.id` | messages |
| Type expéditeur | `sender_type` | `text ('client'|'admin')` | messages |
| Corps du message | `body` | `text` | messages |
| Lu/non lu | `is_read` | `boolean` | messages |
| Contenu terminé | `is_done` | `boolean` | content_progress |
| Nom complet | `full_name` | `text` | profiles |
| Nom prospect | `name` | `text` | leads, booking_requests |
| Service demandé | `program_interest` | `text` | leads |
| Service réservation | `service` | `text` | booking_requests, sessions |

---

## Test de validation dans Supabase

Après exécution des 3 fichiers SQL, vérifier dans **Table Editor** :

```sql
-- Vérifier les colonnes de content_progress
select column_name, data_type
from information_schema.columns
where table_name = 'content_progress' and table_schema = 'public'
order by ordinal_position;
-- Attendu : id, client_id, content_id, is_done, completed_at, created_at

-- Vérifier que les index existent
select indexname, indexdef
from pg_indexes
where tablename = 'content_progress' and schemaname = 'public';
-- Attendu : idx_cp_client_id, idx_cp_content_id

-- Vérifier is_admin()
select is_admin();
-- Attendu : false (aucun admin configuré, normale)
```

---

*Rapport généré — NZ 100% SQL Fix · Mai 2026*
