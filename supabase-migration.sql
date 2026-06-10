-- =====================================================================
-- HABYNEX — Migration SQL
-- Nouvelles tables : contract_templates, field_reports
-- =====================================================================

-- ── 1. Modèles de contrats (éditable depuis l'admin) ──────────────────
CREATE TABLE IF NOT EXISTS contract_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL DEFAULT 'Contrat Agent Habynex',
  type          TEXT NOT NULL DEFAULT 'agent' CHECK (type IN ('agent', 'photographer')),
  version       TEXT NOT NULL DEFAULT '1.0',
  content       JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour récupérer rapidement le contrat actif par type
CREATE INDEX IF NOT EXISTS contract_templates_type_active_idx
  ON contract_templates (type, is_active, created_at DESC);

-- Mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_contract_templates_updated_at ON contract_templates;
CREATE TRIGGER update_contract_templates_updated_at
  BEFORE UPDATE ON contract_templates
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Ajouter template_id à agent_contracts si pas déjà là
ALTER TABLE agent_contracts
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES contract_templates(id) ON DELETE SET NULL;

-- ── 2. Rapports terrain quotidiens (soumis par agents/photographes) ──
CREATE TABLE IF NOT EXISTS field_reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  report_date           DATE NOT NULL,
  role_type             TEXT DEFAULT 'agent' CHECK (role_type IN ('agent', 'photographer')),
  mission_count         INTEGER NOT NULL DEFAULT 0,
  successful_missions   INTEGER NOT NULL DEFAULT 0,
  neighborhoods_covered TEXT[] DEFAULT '{}',
  client_feedback       TEXT DEFAULT '',
  issues_encountered    TEXT DEFAULT '',
  suggestions           TEXT DEFAULT '',
  mood_score            INTEGER DEFAULT 3 CHECK (mood_score BETWEEN 1 AND 5),
  transport_mode        TEXT DEFAULT '',
  ai_analysis           TEXT,
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un seul rapport par agent par jour
  UNIQUE (agent_id, report_date)
);

CREATE INDEX IF NOT EXISTS field_reports_agent_id_idx ON field_reports (agent_id);
CREATE INDEX IF NOT EXISTS field_reports_date_idx ON field_reports (report_date DESC);
CREATE INDEX IF NOT EXISTS field_reports_submitted_at_idx ON field_reports (submitted_at DESC);

-- ── 3. RLS — Row Level Security ───────────────────────────────────────

-- contract_templates : lecture publique (pour les agents signant), écriture admin uniquement
ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contract_templates_read" ON contract_templates
  FOR SELECT USING (true);

CREATE POLICY "contract_templates_admin_write" ON contract_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- field_reports : l'agent peut lire/créer les siens, admin peut tout lire
ALTER TABLE field_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "field_reports_own" ON field_reports
  FOR ALL USING (agent_id = auth.uid());

CREATE POLICY "field_reports_admin_read" ON field_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Admin peut mettre à jour ai_analysis
CREATE POLICY "field_reports_admin_update" ON field_reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- ── 4. Insérer un template par défaut ─────────────────────────────────
INSERT INTO contract_templates (title, type, version, content, is_active)
VALUES (
  'Contrat Agent Habynex',
  'agent',
  '1.0',
  '{
    "articles": [
      {
        "id": "missions",
        "title": "ARTICLE 1 — MISSIONS DE L''AGENT",
        "body": "• Contacter les clients dans les 2 heures suivant l''attribution d''une mission de visite.\n• Accompagner le client sur le terrain pour visiter les biens sélectionnés.\n• Fournir des informations honnêtes et précises sur les biens visités.\n• Renseigner le rapport de visite sur la plateforme dans les 24h suivant la visite.\n• Maintenir un comportement professionnel, ponctuel et respectueux en toutes circonstances."
      },
      {
        "id": "obligations",
        "title": "ARTICLE 2 — OBLIGATIONS DE L''AGENT",
        "body": "• Ne jamais recevoir de paiements en dehors de la plateforme Habynex.\n• Ne jamais promettre un bien à un client contre une rémunération personnelle.\n• Signaler immédiatement tout propriétaire ou bien suspect à l''équipe Habynex.\n• Maintenir son téléphone actif et disponible pendant les heures de travail.\n• Ne pas partager les informations confidentielles des clients avec des tiers.\n• Respecter les politiques de traitement des données personnelles d''Habynex."
      },
      {
        "id": "resiliation",
        "title": "ARTICLE 3 — RÉSILIATION",
        "body": "Le présent contrat peut être résilié :\n• Par Habynex : immédiatement et sans préavis en cas de faute grave (fraude, perception illicite de fonds, comportement irrespectueux envers un client).\n• Par l''Agent : avec un préavis de 7 jours notifié via la plateforme ou par WhatsApp au +237 654 888 084."
      },
      {
        "id": "droit",
        "title": "ARTICLE 4 — DROIT APPLICABLE",
        "body": "Le présent contrat est soumis au droit camerounais. En cas de litige, les parties conviennent de rechercher une solution amiable. À défaut, les tribunaux compétents de Yaoundé seront saisis."
      }
    ],
    "remuneration": {
      "fixed_salary": 50000,
      "min_missions": 4,
      "daily_allowance": 1000,
      "payment_day": "1er de chaque mois",
      "allowance_payment": "chaque vendredi pour les jours de la semaine écoulée",
      "notes": "Toutes les rémunérations sont versées exclusivement via la plateforme Habynex. L''Agent ne peut en aucun cas percevoir des fonds directement auprès des clients pour des prestations officielles Habynex."
    }
  }'::jsonb,
  true
) ON CONFLICT DO NOTHING;

INSERT INTO contract_templates (title, type, version, content, is_active)
VALUES (
  'Contrat Photographe Habynex',
  'photographer',
  '1.0',
  '{
    "articles": [
      {
        "id": "missions",
        "title": "ARTICLE 1 — MISSIONS DU PHOTOGRAPHE",
        "body": "• Réaliser des photos de qualité professionnelle des biens immobiliers assignés.\n• Se rendre sur place dans les délais convenus avec le propriétaire.\n• Livrer les photos retouchées dans les 48h suivant la séance.\n• Respecter la charte graphique Habynex pour les photos publiées.\n• Maintenir un comportement professionnel en toutes circonstances."
      },
      {
        "id": "obligations",
        "title": "ARTICLE 2 — OBLIGATIONS DU PHOTOGRAPHE",
        "body": "• Ne jamais partager les photos avec des tiers sans autorisation d''Habynex.\n• Ne pas facturer directement les propriétaires pour des services Habynex.\n• Signaler tout bien ne correspondant pas à la description fournie."
      },
      {
        "id": "resiliation",
        "title": "ARTICLE 3 — RÉSILIATION",
        "body": "Résiliation possible par Habynex en cas de manquement grave, ou par le Photographe avec un préavis de 7 jours."
      }
    ],
    "remuneration": {
      "fixed_salary": 50000,
      "min_missions": 4,
      "daily_allowance": 1000,
      "payment_day": "1er de chaque mois",
      "allowance_payment": "chaque vendredi pour les jours de la semaine écoulée",
      "notes": "Toutes les rémunérations sont versées exclusivement via la plateforme Habynex."
    }
  }'::jsonb,
  true
) ON CONFLICT DO NOTHING;

-- ── HIGH VIEWS : colonne pour tracer les seuils déjà notifiés ────────────────
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS notified_view_thresholds integer[] DEFAULT '{}';

COMMENT ON COLUMN listings.notified_view_thresholds IS
  'Seuils de vues déjà notifiés à l''agent (ex: [50, 100]). Géré par high-views Edge Function.';

CREATE INDEX IF NOT EXISTS idx_listings_high_views
  ON listings (status, views_count)
  WHERE status = 'published';

-- ── FAILED PUSH JOBS : table pour les jobs push échoués ──────────────────────
CREATE TABLE IF NOT EXISTS failed_push_jobs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id        uuid NOT NULL,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type          text NOT NULL,
  payload       jsonb,
  error         text,
  attempts      integer DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

-- ── NOTIFICATION HISTORY : si pas encore créée ───────────────────────────────
CREATE TABLE IF NOT EXISTS notification_history (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text NOT NULL,
  title      text,
  content    text,
  metadata   jsonb,
  read       boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_history_user
  ON notification_history (user_id, created_at DESC);

SELECT 'Migration admin-notification + high-views ✓' AS status;
