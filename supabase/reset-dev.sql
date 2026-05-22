-- ============================================================
-- NZ 100% — RESET DEV
-- ⚠️  À exécuter UNIQUEMENT si des tables ont été créées
--     partiellement (ex : erreur lors d'un schema.sql précédent)
-- ⚠️  DÉTRUIT TOUTES LES DONNÉES — usage développement seulement
-- Ordre : tables dépendantes d'abord, puis tables parents
-- ============================================================

-- Supprimer les triggers d'abord
drop trigger if exists trg_on_auth_user_created on auth.users;
drop trigger if exists trg_profiles_updated     on profiles;
drop trigger if exists trg_leads_updated        on leads;
drop trigger if exists trg_sessions_updated     on sessions;
drop trigger if exists trg_booking_updated      on booking_requests;

-- Supprimer les fonctions
drop function if exists handle_new_user()  cascade;
drop function if exists set_updated_at()   cascade;
drop function if exists is_admin()         cascade;

-- Supprimer les tables (ordre : dépendances en premier)
drop table if exists content_progress  cascade;
drop table if exists program_contents  cascade;
drop table if exists program_modules   cascade;
drop table if exists client_programs   cascade;
drop table if exists booking_requests  cascade;
drop table if exists messages          cascade;
drop table if exists sessions          cascade;
drop table if exists programs          cascade;
drop table if exists leads             cascade;
drop table if exists profiles          cascade;

-- ============================================================
-- Après ce script : relancer schema.sql → policies.sql → seed.sql
-- ============================================================
