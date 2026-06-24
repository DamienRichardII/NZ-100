-- ═══════════════════════════════════════════════════════════════════
--  NZ-100 Migration — 2026-06-25
--  1. Champs présence/retention sur booking_requests
--  2. Table retention_logs
--  3. Offres basket dans payments (contrainte CHECK élargie)
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Colonnes présence sur booking_requests ──────────────────────
ALTER TABLE public.booking_requests
  ADD COLUMN IF NOT EXISTS retention_pct     INTEGER DEFAULT 0 CHECK (retention_pct >= 0 AND retention_pct <= 100),
  ADD COLUMN IF NOT EXISTS actioned_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS session_type      TEXT;   -- type de séance textuel

-- Élargir les statuts autorisés
DO $$
BEGIN
  -- On vérifie s'il y a une contrainte CHECK sur status et on la remplace
  -- (Supabase crée souvent booking_requests_status_check)
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'booking_requests' AND column_name = 'status'
    AND constraint_name LIKE '%status%check%'
  ) THEN
    -- DROP/ADD de la contrainte (le nom peut varier, on la supprime via pg_constraint)
    EXECUTE (
      SELECT 'ALTER TABLE public.booking_requests DROP CONSTRAINT ' || quote_ident(conname)
      FROM pg_constraint
      WHERE conrelid = 'public.booking_requests'::regclass
        AND conname ILIKE '%status%'
        AND contype = 'c'
      LIMIT 1
    );
  END IF;
END
$$;

ALTER TABLE public.booking_requests
  ADD CONSTRAINT booking_requests_status_check
  CHECK (status IN (
    'pending', 'payment_received', 'confirmed',
    'honore', 'annule_veille', 'annule_j', 'no_show',
    'cancelled', 'failed'
  ));

-- ── 2. Table retention_logs ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.retention_logs (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_request_id  UUID REFERENCES public.booking_requests(id) ON DELETE SET NULL,
  action              TEXT NOT NULL CHECK (action IN ('annule_veille','annule_j','no_show')),
  retention_pct       INTEGER NOT NULL DEFAULT 0,
  logged_at           TIMESTAMPTZ DEFAULT NOW(),
  notes               TEXT
);

-- RLS
ALTER TABLE public.retention_logs ENABLE ROW LEVEL SECURITY;

-- Seul l'admin (service_role) peut lire/écrire
CREATE POLICY "Admin full access retention_logs"
  ON public.retention_logs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── 3. Index utiles ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS retention_logs_booking_idx ON public.retention_logs(booking_request_id);
CREATE INDEX IF NOT EXISTS booking_requests_status_idx ON public.booking_requests(status);
CREATE INDEX IF NOT EXISTS booking_requests_actioned_at_idx ON public.booking_requests(actioned_at);

-- ── 4. Vues admin (optionnel, pratique pour les KPIs) ─────────────
CREATE OR REPLACE VIEW public.v_retention_summary AS
SELECT
  action,
  COUNT(*) AS count,
  AVG(retention_pct) AS avg_retention_pct,
  DATE_TRUNC('month', logged_at) AS month
FROM public.retention_logs
GROUP BY action, month
ORDER BY month DESC, action;

COMMENT ON TABLE public.retention_logs IS 'Enregistre les annulations et no-shows avec le pourcentage retenu.';
COMMENT ON TABLE public.booking_requests IS 'Demandes de réservation clients — paiement Stripe et statut présence.';
