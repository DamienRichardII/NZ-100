-- ═══════════════════════════════════════════════════════════════════
-- NZ-100 — Schéma paiements Stripe
-- Fichier  : supabase/payments-schema.sql
-- À exécuter dans : Supabase > SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- 1. Colonnes paiement sur booking_requests
-- ───────────────────────────────────────────────────────────────────
alter table public.booking_requests
  add column if not exists payment_status            text    default 'unpaid',
  add column if not exists payment_url               text,
  add column if not exists stripe_checkout_session_id text;

comment on column public.booking_requests.payment_status is
  'unpaid | pending | paid | failed';
comment on column public.booking_requests.payment_url is
  'URL Stripe Checkout ou Payment Link';
comment on column public.booking_requests.stripe_checkout_session_id is
  'ID session Stripe Checkout (cs_live_...)';

-- ───────────────────────────────────────────────────────────────────
-- 2. Table payments
-- ───────────────────────────────────────────────────────────────────
create table if not exists public.payments (
  id                          uuid        primary key default gen_random_uuid(),
  booking_request_id          uuid        references public.booking_requests(id) on delete set null,
  lead_id                     uuid        references public.leads(id)            on delete set null,
  client_id                   uuid        references public.profiles(id)         on delete set null,
  stripe_checkout_session_id  text        unique,
  stripe_payment_intent_id    text,
  amount_eur                  integer     not null,          -- en centimes (ex : 3000 = 30 €)
  currency                    text        not null default 'eur',
  status                      text        not null default 'pending',  -- pending | paid | failed | refunded
  payment_url                 text,
  created_at                  timestamptz not null default now(),
  paid_at                     timestamptz
);

comment on table public.payments is
  'Enregistrements des transactions Stripe. Remplie par la Edge Function stripe-webhook.';
comment on column public.payments.amount_eur is
  'Montant en centimes (3000 = 30 €, 6000 = 60 €, 7000 = 70 €)';

-- ───────────────────────────────────────────────────────────────────
-- 3. RLS sur payments
-- ───────────────────────────────────────────────────────────────────
alter table public.payments enable row level security;

-- Admin : lecture totale
create policy "payments_admin_all"
  on public.payments
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Client connecté : lecture de ses propres paiements
create policy "payments_client_select"
  on public.payments
  for select
  to authenticated
  using (client_id = auth.uid());

-- anon : aucun accès (pas de policy → bloqué par défaut avec RLS activé)

-- ───────────────────────────────────────────────────────────────────
-- 4. GRANT
-- ───────────────────────────────────────────────────────────────────
grant usage on schema public to authenticated;
grant select, insert, update on table public.payments to authenticated;

-- ───────────────────────────────────────────────────────────────────
-- 5. Edge Functions — accès service role (via secret, jamais frontend)
-- ───────────────────────────────────────────────────────────────────
-- La Edge Function stripe-webhook utilise la service_role key côté serveur
-- pour pouvoir insérer dans payments sans contrainte RLS.
-- Cette clé est stockée dans les Secrets Supabase :
--   SUPABASE_SERVICE_ROLE_KEY (auto-disponible dans les Edge Functions)

-- ───────────────────────────────────────────────────────────────────
-- 6. Vérifications
-- ───────────────────────────────────────────────────────────────────
-- Vérifier les colonnes ajoutées sur booking_requests :
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'booking_requests'
-- and column_name in ('payment_status','payment_url','stripe_checkout_session_id');

-- Vérifier la table payments :
-- select * from public.payments limit 1;

-- Vérifier les policies :
-- select schemaname, tablename, policyname, roles, cmd
-- from pg_policies
-- where tablename = 'payments';
