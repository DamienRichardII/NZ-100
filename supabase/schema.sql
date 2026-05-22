-- ═══════════════════════════════════════════════════════════════════
-- NZ 100% — SCHEMA SUPABASE v3
-- Projet : gzrlhvbqdscccqdcklpn
-- Convention : toutes les FKs vers profiles utilisent "client_id"
-- Extension  : pgcrypto (gen_random_uuid)
-- ═══════════════════════════════════════════════════════════════════

-- Extension UUID (pgcrypto — recommandé Supabase)
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────
-- TABLE : profiles
-- Extension de auth.users — créée automatiquement via trigger
-- ─────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  full_name   text        not null default '',
  email       text,
  phone       text,
  role        text        not null default 'client',   -- 'client' | 'admin'
  avatar_url  text,
  notes       text,                                     -- notes privées coach
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table profiles is 'Profils utilisateurs liés à auth.users. role=admin pour Mathieu.';

-- ─────────────────────────────────────────────────────────────────
-- TABLE : leads
-- Formulaire de contact — pas d'authentification requise
-- ─────────────────────────────────────────────────────────────────
create table if not exists leads (
  id               uuid        primary key default gen_random_uuid(),
  first_name       text        not null,
  last_name        text,
  email            text        not null,
  phone            text,
  program_interest text,                                -- service souhaité
  objective        text,                                -- objectif personnel
  message          text,
  source           text        not null default 'contact_form',
  status           text        not null default 'nouveau',  -- nouveau | contacte | converti | refuse
  notes            text,                                -- notes admin
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table leads is 'Demandes de contact entrants. Insertion publique sans auth.';

-- ─────────────────────────────────────────────────────────────────
-- TABLE : programs
-- Catalogue des programmes NZ
-- ─────────────────────────────────────────────────────────────────
create table if not exists programs (
  id             uuid        primary key default gen_random_uuid(),
  slug           text        unique not null,
  title          text        not null,
  subtitle       text,
  description    text,
  price_eur      numeric(8,2),
  duration_weeks int,
  cover_url      text,
  is_active      boolean     not null default true,
  position       int         not null default 0,
  created_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────
-- TABLE : program_modules
-- Modules au sein d'un programme
-- ─────────────────────────────────────────────────────────────────
create table if not exists program_modules (
  id          uuid        primary key default gen_random_uuid(),
  program_id  uuid        not null references programs(id) on delete cascade,
  title       text        not null,
  description text,
  position    int         not null default 0,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────
-- TABLE : program_contents
-- Contenus au sein d'un module (vidéo, PDF, texte…)
-- ─────────────────────────────────────────────────────────────────
create table if not exists program_contents (
  id           uuid        primary key default gen_random_uuid(),
  module_id    uuid        not null references program_modules(id) on delete cascade,
  title        text        not null,
  content_type text        not null default 'video',   -- 'video' | 'pdf' | 'text'
  content_url  text,
  duration_min int,
  description  text,
  position     int         not null default 0,
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────
-- TABLE : client_programs
-- Attribution d'un programme à un client
-- ─────────────────────────────────────────────────────────────────
create table if not exists client_programs (
  id           uuid        primary key default gen_random_uuid(),
  client_id    uuid        not null references profiles(id) on delete cascade,
  program_id   uuid        not null references programs(id) on delete cascade,
  status       text        not null default 'active',  -- 'active' | 'paused' | 'completed'
  started_at   timestamptz not null default now(),
  progress_pct int         not null default 0,
  unique (client_id, program_id)
);
comment on table client_programs is 'Programme attribué à un client. client_id = profiles.id.';

-- ─────────────────────────────────────────────────────────────────
-- TABLE : content_progress
-- Suivi de la progression d'un client sur les contenus
-- ─────────────────────────────────────────────────────────────────
create table if not exists content_progress (
  id               uuid        primary key default gen_random_uuid(),
  client_id        uuid        not null references profiles(id) on delete cascade,
  content_id       uuid        not null references program_contents(id) on delete cascade,
  is_done          boolean     not null default false,
  progress_percent int         not null default 0,     -- progression partielle 0-100
  completed_at     timestamptz,
  last_seen_at     timestamptz,
  created_at       timestamptz not null default now(),
  unique (client_id, content_id)
);
comment on table content_progress is 'Progression client. client_id=profiles.id, content_id=program_contents.id.';

-- ─────────────────────────────────────────────────────────────────
-- TABLE : messages
-- Messagerie coach ↔ client
-- client_id identifie le thread ; sender_id l'expéditeur ; receiver_id le destinataire
-- ─────────────────────────────────────────────────────────────────
create table if not exists messages (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        not null references profiles(id) on delete cascade,
  sender_id   uuid        not null references profiles(id),
  receiver_id uuid        references profiles(id) on delete set null,
  sender_type text        not null,   -- 'client' | 'admin'
  body        text        not null,
  is_read     boolean     not null default false,
  created_at  timestamptz not null default now()
);
comment on table messages is 'Messages. client_id=thread. sender_id=expéditeur. receiver_id=destinataire. sender_type=client|admin.';

-- ─────────────────────────────────────────────────────────────────
-- TABLE : sessions
-- Séances planifiées ou effectuées
-- ─────────────────────────────────────────────────────────────────
create table if not exists sessions (
  id           uuid        primary key default gen_random_uuid(),
  client_id    uuid        not null references profiles(id) on delete cascade,
  session_date date        not null,
  start_time   time,
  end_time     time,
  service      text,                -- 'basket' | 'remise-en-forme' | 'performance'…
  location     text,
  status       text        not null default 'planifiee',  -- planifiee | confirmee | annulee | effectuee
  price_eur    numeric(8,2),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────
-- TABLE : booking_requests
-- Demandes de réservation basket — prospect non connecté possible
-- ─────────────────────────────────────────────────────────────────
create table if not exists booking_requests (
  id             uuid        primary key default gen_random_uuid(),
  client_id      uuid        references profiles(id) on delete set null,  -- null si prospect
  lead_id        uuid        references leads(id) on delete set null,      -- lead lié si disponible
  name           text,
  email          text,
  phone          text,
  service        text        not null default 'Coaching Basket individuel',
  requested_date date,
  requested_time text,                                   -- ex : '17h30'
  message        text,
  status         text        not null default 'pending', -- pending | confirmed | cancelled
  admin_notes    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table booking_requests is 'Réservations basket. Insertion publique sans auth.';

-- ─────────────────────────────────────────────────────────────────
-- TRIGGER : updated_at automatique
-- ─────────────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated
  before update on profiles
  for each row execute function set_updated_at();

create trigger trg_leads_updated
  before update on leads
  for each row execute function set_updated_at();

create trigger trg_sessions_updated
  before update on sessions
  for each row execute function set_updated_at();

create trigger trg_booking_updated
  before update on booking_requests
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- TRIGGER : auto-création du profil à l'inscription
-- ─────────────────────────────────────────────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      concat(
        coalesce(new.raw_user_meta_data->>'first_name', ''),
        ' ',
        coalesce(new.raw_user_meta_data->>'last_name', '')
      )
    ),
    new.email,
    'client'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─────────────────────────────────────────────────────────────────
-- INDEX — performance sur les requêtes courantes
-- ─────────────────────────────────────────────────────────────────
create index if not exists idx_leads_status              on leads(status);
create index if not exists idx_leads_created_at          on leads(created_at desc);
create index if not exists idx_leads_email               on leads(email);
create index if not exists idx_client_programs_client_id on client_programs(client_id);
create index if not exists idx_cp_client_id              on content_progress(client_id);
create index if not exists idx_cp_content_id             on content_progress(content_id);
create index if not exists idx_messages_client_id        on messages(client_id);
create index if not exists idx_messages_created_at       on messages(created_at desc);
create index if not exists idx_sessions_client_id        on sessions(client_id);
create index if not exists idx_sessions_date             on sessions(session_date);
create index if not exists idx_booking_status            on booking_requests(status);
create index if not exists idx_booking_email             on booking_requests(email);
