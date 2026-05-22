-- ═══════════════════════════════════════════════════════════════════
-- NZ 100% — ROW LEVEL SECURITY POLICIES v3
-- Projet : gzrlhvbqdscccqdcklpn
-- Convention : client_id = profiles.id
--              sender_id = profiles.id (expéditeur)
--              receiver_id = profiles.id (destinataire, nullable)
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- HELPER : is_admin()
-- Vérifie que l'utilisateur courant a le rôle 'admin'
-- N'utilise JAMAIS un mot de passe codé en dur
-- ─────────────────────────────────────────────────────────────────
create or replace function is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id   = auth.uid()
      and role = 'admin'
  );
$$;

-- ═══════════════════════════════════════════════════════════════════
-- PROFILES
-- ═══════════════════════════════════════════════════════════════════
alter table profiles enable row level security;

-- Client : voit uniquement son propre profil (ou admin voit tous)
create policy "profiles_select" on profiles
  for select using ( auth.uid() = id OR is_admin() );

-- Client : modifie son propre profil sans pouvoir changer son rôle
create policy "profiles_client_update" on profiles
  for update
  using  ( auth.uid() = id )
  with check ( auth.uid() = id AND role = 'client' );

-- Admin : modifie n'importe quel profil (inclut changement de rôle)
create policy "profiles_admin_update" on profiles
  for update using ( is_admin() );

-- Insert automatique via trigger handle_new_user (security definer)
create policy "profiles_insert_own" on profiles
  for insert with check ( auth.uid() = id );

-- ═══════════════════════════════════════════════════════════════════
-- LEADS
-- ═══════════════════════════════════════════════════════════════════
alter table leads enable row level security;

-- Insertion publique sans authentification
create policy "leads_public_insert" on leads
  for insert with check ( true );

-- Lecture, mise à jour, suppression : admin uniquement
create policy "leads_admin_select" on leads
  for select using ( is_admin() );

create policy "leads_admin_update" on leads
  for update using ( is_admin() );

create policy "leads_admin_delete" on leads
  for delete using ( is_admin() );

-- ═══════════════════════════════════════════════════════════════════
-- PROGRAMS
-- ═══════════════════════════════════════════════════════════════════
alter table programs enable row level security;

-- Client : voit les programmes qui lui sont attribués (+ admin)
create policy "programs_client_select" on programs
  for select using (
    is_admin() OR
    exists (
      select 1 from client_programs cp
      where cp.program_id = programs.id
        and cp.client_id  = auth.uid()
        and cp.status     = 'active'
    )
  );

-- Admin : accès complet
create policy "programs_admin_all" on programs
  for all using ( is_admin() );

-- ═══════════════════════════════════════════════════════════════════
-- PROGRAM_MODULES
-- ═══════════════════════════════════════════════════════════════════
alter table program_modules enable row level security;

create policy "modules_client_select" on program_modules
  for select using (
    is_admin() OR
    exists (
      select 1 from client_programs cp
      where cp.program_id = program_modules.program_id
        and cp.client_id  = auth.uid()
        and cp.status     = 'active'
    )
  );

create policy "modules_admin_all" on program_modules
  for all using ( is_admin() );

-- ═══════════════════════════════════════════════════════════════════
-- PROGRAM_CONTENTS
-- ═══════════════════════════════════════════════════════════════════
alter table program_contents enable row level security;

create policy "contents_client_select" on program_contents
  for select using (
    is_admin() OR
    exists (
      select 1
      from program_modules pm
      join client_programs cp on cp.program_id = pm.program_id
      where pm.id          = program_contents.module_id
        and cp.client_id   = auth.uid()
        and cp.status      = 'active'
    )
  );

create policy "contents_admin_all" on program_contents
  for all using ( is_admin() );

-- ═══════════════════════════════════════════════════════════════════
-- CLIENT_PROGRAMS
-- ═══════════════════════════════════════════════════════════════════
alter table client_programs enable row level security;

-- Client : voit uniquement ses propres attributions
create policy "client_programs_select" on client_programs
  for select using ( auth.uid() = client_id OR is_admin() );

-- Admin : accès complet (attribution + modification)
create policy "client_programs_admin_all" on client_programs
  for all using ( is_admin() );

-- ═══════════════════════════════════════════════════════════════════
-- CONTENT_PROGRESS
-- client_id = profiles.id du client
-- ═══════════════════════════════════════════════════════════════════
alter table content_progress enable row level security;

-- Client : lit uniquement sa propre progression
create policy "progress_select" on content_progress
  for select using ( auth.uid() = client_id OR is_admin() );

-- Client : insère uniquement pour lui-même
create policy "progress_client_insert" on content_progress
  for insert with check ( auth.uid() = client_id );

-- Client : met à jour uniquement sa propre progression
create policy "progress_client_update" on content_progress
  for update
  using     ( auth.uid() = client_id )
  with check ( auth.uid() = client_id );

-- Admin : accès complet
create policy "progress_admin_all" on content_progress
  for all using ( is_admin() );

-- ═══════════════════════════════════════════════════════════════════
-- MESSAGES
-- client_id = thread (le client concerné)
-- sender_id = auth.users.id (l'expéditeur)
-- sender_type = 'client' | 'admin'
-- ═══════════════════════════════════════════════════════════════════
alter table messages enable row level security;

-- Client : voit les messages de son thread
create policy "messages_client_select" on messages
  for select using (
    auth.uid() = client_id OR is_admin()
  );

-- Client envoie un message : sender_id doit être lui-même
-- et il doit être le propriétaire du thread ou admin
-- receiver_id est optionnel (nullable)
create policy "messages_client_insert" on messages
  for insert with check (
    auth.uid() = sender_id
    AND ( auth.uid() = client_id OR is_admin() )
  );

-- Admin : marquer is_read, modifier
create policy "messages_admin_update" on messages
  for update using ( is_admin() );

-- Admin : accès complet
create policy "messages_admin_all" on messages
  for all using ( is_admin() );

-- ═══════════════════════════════════════════════════════════════════
-- SESSIONS
-- client_id = profiles.id
-- ═══════════════════════════════════════════════════════════════════
alter table sessions enable row level security;

-- Client : voit uniquement ses propres séances
create policy "sessions_client_select" on sessions
  for select using ( auth.uid() = client_id OR is_admin() );

-- Admin : accès complet (création, modification, suppression)
create policy "sessions_admin_all" on sessions
  for all using ( is_admin() );

-- ═══════════════════════════════════════════════════════════════════
-- BOOKING_REQUESTS
-- client_id optionnel (null si prospect non connecté)
-- ═══════════════════════════════════════════════════════════════════
alter table booking_requests enable row level security;

-- Insertion publique sans authentification (prospect non connecté)
create policy "booking_public_insert" on booking_requests
  for insert with check ( true );

-- Client connecté : voit ses propres demandes
create policy "booking_client_select" on booking_requests
  for select using (
    auth.uid() = client_id OR is_admin()
  );

-- Admin : accès complet
create policy "booking_admin_all" on booking_requests
  for all using ( is_admin() );
