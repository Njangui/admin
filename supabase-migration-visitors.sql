-- ================================================================
-- HABYNEX — Suivi des visiteurs (visiteurs non inscrits + analytics)
-- À exécuter dans Supabase (SQL editor) sur le projet principal
-- ================================================================

-- ── 1. Table site_visits ───────────────────────────────────────────────
-- Une ligne = une page vue (par un visiteur anonyme OU un utilisateur connecté)
CREATE TABLE IF NOT EXISTS site_visits (
  id            BIGSERIAL PRIMARY KEY,
  visitor_id    TEXT NOT NULL,              -- identifiant anonyme persistant (cookie)
  user_id       UUID REFERENCES profiles(id) ON DELETE SET NULL, -- si connecté
  path          TEXT NOT NULL,              -- page visitée, ex: /bien/villa-bastos
  listing_id    UUID REFERENCES listings(id) ON DELETE SET NULL, -- si la page est une annonce
  referrer      TEXT,                       -- d'où vient le visiteur
  user_agent    TEXT,
  device_type   TEXT,                       -- mobile / desktop / tablet
  country       TEXT,
  city          TEXT,
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_visits_created_at_idx ON site_visits (created_at DESC);
CREATE INDEX IF NOT EXISTS site_visits_visitor_id_idx ON site_visits (visitor_id);
CREATE INDEX IF NOT EXISTS site_visits_user_id_idx ON site_visits (user_id);
CREATE INDEX IF NOT EXISTS site_visits_path_idx ON site_visits (path);
CREATE INDEX IF NOT EXISTS site_visits_listing_id_idx ON site_visits (listing_id);
CREATE INDEX IF NOT EXISTS site_visits_country_idx ON site_visits (country);

-- ── 2. RLS — Row Level Security ─────────────────────────────────────────
ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;

-- N'importe qui (y compris anonyme) peut insérer une vue de page
CREATE POLICY "site_visits_insert_anyone" ON site_visits
  FOR INSERT WITH CHECK (true);

-- Seuls les admins peuvent lire les données de visite
CREATE POLICY "site_visits_admin_read" ON site_visits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- ── 3. Vue utilitaire : visiteurs uniques (anonymes, jamais inscrits) ──
-- Un "visiteur" anonyme = un visitor_id qui n'est jamais lié à un user_id connecté
CREATE OR REPLACE VIEW site_visitors_summary AS
SELECT
  visitor_id,
  MIN(created_at) AS first_seen_at,
  MAX(created_at) AS last_seen_at,
  COUNT(*) AS visit_count,
  COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS logged_in_visit_count,
  MAX(user_id) AS last_known_user_id,
  (ARRAY_AGG(path ORDER BY created_at DESC))[1] AS last_path,
  (ARRAY_AGG(device_type ORDER BY created_at DESC))[1] AS last_device_type,
  (ARRAY_AGG(country ORDER BY created_at DESC))[1] AS last_country,
  (ARRAY_AGG(city ORDER BY created_at DESC))[1] AS last_city,
  (ARRAY_AGG(referrer ORDER BY created_at DESC))[1] AS last_referrer
FROM site_visits
GROUP BY visitor_id;

-- ── 4. Vue utilitaire : répartition par heure de la journée ─────────────
-- Utile pour identifier les heures de pointe (basé sur le fuseau de la BD)
CREATE OR REPLACE VIEW site_visits_by_hour AS
SELECT
  EXTRACT(HOUR FROM created_at)::int AS hour_of_day,
  COUNT(*) AS visit_count,
  COUNT(DISTINCT visitor_id) AS unique_visitors
FROM site_visits
GROUP BY 1
ORDER BY 1;

-- ── 5. Vue utilitaire : répartition géographique (pays / ville) ─────────
CREATE OR REPLACE VIEW site_visits_by_geo AS
SELECT
  COALESCE(country, 'Inconnu') AS country,
  COALESCE(city, 'Inconnu') AS city,
  COUNT(*) AS visit_count,
  COUNT(DISTINCT visitor_id) AS unique_visitors
FROM site_visits
GROUP BY 1, 2
ORDER BY visit_count DESC;

-- ── 6. Vue utilitaire : vues par annonce ─────────────────────────────────
CREATE OR REPLACE VIEW listing_visits_summary AS
SELECT
  listing_id,
  COUNT(*) AS visit_count,
  COUNT(DISTINCT visitor_id) AS unique_visitors,
  MAX(created_at) AS last_viewed_at
FROM site_visits
WHERE listing_id IS NOT NULL
GROUP BY listing_id;
