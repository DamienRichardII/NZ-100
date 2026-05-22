-- ═══════════════════════════════════════════════════════════════════
-- NZ-100 — Correctif RLS + GRANT : table public.leads
-- ═══════════════════════════════════════════════════════════════════
-- Erreur corrigée : "new row violates row-level security policy for table leads"
-- Cause : GRANT INSERT manquant pour le rôle anon + policy sans clause TO anon
-- À exécuter dans : Supabase > SQL Editor
-- Date : 2026-05-22
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. S'assurer que RLS est activé ───────────────────────────────
alter table public.leads enable row level security;

-- ── 2. Recréer les policies avec TO anon / TO authenticated ───────
drop policy if exists "leads_public_insert"  on public.leads;
drop policy if exists "leads_admin_select"   on public.leads;
drop policy if exists "leads_admin_update"   on public.leads;
drop policy if exists "leads_admin_delete"   on public.leads;

-- INSERT public : anon (formulaire contact sans auth) + authenticated
create policy "leads_public_insert"
  on public.leads
  for insert
  to anon, authenticated
  with check (true);

-- SELECT admin uniquement
create policy "leads_admin_select"
  on public.leads
  for select
  to authenticated
  using ( public.is_admin() );

-- UPDATE admin uniquement
create policy "leads_admin_update"
  on public.leads
  for update
  to authenticated
  using ( public.is_admin() )
  with check ( public.is_admin() );

-- DELETE admin uniquement
create policy "leads_admin_delete"
  on public.leads
  for delete
  to authenticated
  using ( public.is_admin() );

-- ── 3. GRANT — droits SQL sur le schéma et la table ───────────────
-- Sans ces GRANT, le rôle anon ne peut pas insérer même si RLS l'autorise.
grant usage on schema public to anon, authenticated;

-- anon : INSERT seulement (pas de SELECT — les leads ne doivent pas être lisibles publiquement)
grant insert on table public.leads to anon;

-- authenticated : toutes les opérations (les policies RLS restreignent à l'admin)
grant insert, select, update, delete on table public.leads to authenticated;

-- ── 4. Fonction is_admin() — créer si absente ─────────────────────
create or replace function public.is_admin()
  returns boolean
  language sql
  security definer
  stable
as $$
  select exists (
    select 1
    from public.profiles
    where id   = auth.uid()
      and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- ── 5. Vérification des policies ──────────────────────────────────
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename  = 'leads'
order by policyname;

-- ── 6. Vérification des GRANT ─────────────────────────────────────
select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name   = 'leads'
order by grantee, privilege_type;

-- ── Résultat attendu ──────────────────────────────────────────────
-- policies :
--   leads_admin_delete  | PERMISSIVE | {authenticated} | DELETE
--   leads_admin_select  | PERMISSIVE | {authenticated} | SELECT
--   leads_admin_update  | PERMISSIVE | {authenticated} | UPDATE
--   leads_public_insert | PERMISSIVE | {anon,authenticated} | INSERT  with_check: true
--
-- grants :
--   anon          | INSERT
--   authenticated | DELETE
--   authenticated | INSERT
--   authenticated | SELECT
--   authenticated | UPDATE
