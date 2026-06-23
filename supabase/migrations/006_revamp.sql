-- ============================================================
-- MIGRATION 006 — Full Revamp
-- Schema: clients, licenses, projects, stages, queries, SOI
-- New: cancel_requests, delete_requests, query_points, soi_products
-- ============================================================

-- ============================================================
-- 1. CLIENTS — add/enforce columns
-- ============================================================
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

-- Partial unique index on GSTIN (null allowed, but if set must be unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_gstin_unique
  ON clients(gstin) WHERE gstin IS NOT NULL AND gstin <> '';

-- ============================================================
-- 2. LICENSES — revamp
-- ============================================================
ALTER TABLE licenses
  ADD COLUMN IF NOT EXISTS categories       TEXT[]    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status           TEXT      NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS authorised_premises TEXT,
  ADD COLUMN IF NOT EXISTS city             TEXT,
  ADD COLUMN IF NOT EXISTS state_name       TEXT;

-- Migrate existing category → categories array
UPDATE licenses SET categories = ARRAY[category] WHERE category IS NOT NULL AND categories = '{}';

-- ============================================================
-- 3. PROJECTS — add fields
-- ============================================================
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS app_ref_no            TEXT,
  ADD COLUMN IF NOT EXISTS awaiting_client_flag  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancel_reason         TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by          UUID REFERENCES auth.users(id);

-- ============================================================
-- 4. STAGES — add skippable + action fields
-- ============================================================
ALTER TABLE stages
  ADD COLUMN IF NOT EXISTS is_skippable          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS skipped_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS skip_reason           TEXT,
  ADD COLUMN IF NOT EXISTS awaiting_client_flag  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS clock_action          TEXT; -- move_to_client | received_from_client | submit_to_fssai | complete

-- ============================================================
-- 5. STAGE TEMPLATES — add new service types, update existing
-- ============================================================

-- Remove old service types
DELETE FROM stage_templates WHERE service_type IN ('Duplicate Copy','Surrender','Other');

-- Update stage_templates to add skippable flag column
ALTER TABLE stage_templates
  ADD COLUMN IF NOT EXISTS is_skippable   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS clock_action   TEXT DEFAULT 'employee'; -- employee | client | fssai

-- Fix existing templates clock_action
UPDATE stage_templates SET clock_action = 'fssai'    WHERE stage_code IN ('AUTH_PROCESS','SCRUTINY','INSPECTION','LICENCE_ISSUED','FEE_PAYMENT');
UPDATE stage_templates SET clock_action = 'client'   WHERE stage_code IN ('CLIENT_APPROVAL','DEF_REPLY');
UPDATE stage_templates SET clock_action = 'employee' WHERE clock_action IS NULL OR clock_action = 'employee';

-- -------- FORM II --------
INSERT INTO stage_templates(service_type, stage_order, stage_name, stage_code, default_days, is_skippable, clock_action) VALUES
  ('Form II', 1, 'Document Collection (Client)',  'DOC_COLLECTION',   7,  FALSE, 'client'),
  ('Form II', 2, 'Application Preparation',       'APP_PREPARATION',  3,  FALSE, 'employee'),
  ('Form II', 3, 'Application Submission',        'APP_SUBMISSION',   1,  FALSE, 'fssai'),
  ('Form II', 4, 'Query Response',                'QUERY_RESPONSE',   7,  TRUE,  'employee'),
  ('Form II', 5, 'Approval',                      'APPROVED',         1,  FALSE, 'fssai')
ON CONFLICT DO NOTHING;

-- -------- ARTWORK --------
INSERT INTO stage_templates(service_type, stage_order, stage_name, stage_code, default_days, is_skippable, clock_action) VALUES
  ('Artwork', 1, 'Artwork Received from Client',    'ART_RECEIVED',     3,  FALSE, 'client'),
  ('Artwork', 2, 'Pending at Employee (Review)',    'ART_REVIEW',       2,  FALSE, 'employee'),
  ('Artwork', 3, 'Sent to Client for Review',       'ART_CLIENT_REVIEW',3,  FALSE, 'client'),
  ('Artwork', 4, 'Confirmation Received',           'ART_CONFIRMED',    1,  FALSE, 'employee'),
  ('Artwork', 5, 'Recheck',                         'ART_RECHECK',      2,  TRUE,  'employee'),
  ('Artwork', 6, 'Approved',                        'ART_APPROVED',     1,  FALSE, 'employee')
ON CONFLICT DO NOTHING;

-- -------- CLAIM CHECK (same as Artwork) --------
INSERT INTO stage_templates(service_type, stage_order, stage_name, stage_code, default_days, is_skippable, clock_action) VALUES
  ('Claim Check', 1, 'Artwork Received from Client',  'ART_RECEIVED',     3,  FALSE, 'client'),
  ('Claim Check', 2, 'Pending at Employee (Review)',  'ART_REVIEW',       2,  FALSE, 'employee'),
  ('Claim Check', 3, 'Sent to Client for Review',     'ART_CLIENT_REVIEW',3,  FALSE, 'client'),
  ('Claim Check', 4, 'Confirmation Received',         'ART_CONFIRMED',    1,  FALSE, 'employee'),
  ('Claim Check', 5, 'Recheck',                       'ART_RECHECK',      2,  TRUE,  'employee'),
  ('Claim Check', 6, 'Approved',                      'ART_APPROVED',     1,  FALSE, 'employee')
ON CONFLICT DO NOTHING;

-- -------- ANNUAL RETURN --------
INSERT INTO stage_templates(service_type, stage_order, stage_name, stage_code, default_days, is_skippable, clock_action) VALUES
  ('Annual Return', 1, 'Data Collection from Client', 'DOC_COLLECTION',  5,  FALSE, 'client'),
  ('Annual Return', 2, 'Return Preparation',           'FORM_FILL',       2,  FALSE, 'employee'),
  ('Annual Return', 3, 'Client Approval',              'CLIENT_APPROVAL', 2,  FALSE, 'client'),
  ('Annual Return', 4, 'Filing with FSSAI',            'FORM_SUBMIT',     1,  FALSE, 'fssai'),
  ('Annual Return', 5, 'Acknowledgement Received',     'LICENCE_ISSUED',  1,  FALSE, 'employee')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. AUTHORITY QUERIES — revamp
-- ============================================================
ALTER TABLE authority_queries
  ADD COLUMN IF NOT EXISTS query_code              TEXT,
  ADD COLUMN IF NOT EXISTS response_days           INTEGER,
  ADD COLUMN IF NOT EXISTS client_response_pending BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS submitted_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by            UUID REFERENCES auth.users(id);

-- Auto-generate query_code for new queries via trigger
CREATE OR REPLACE FUNCTION generate_query_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_project_code TEXT;
  v_seq          INTEGER;
BEGIN
  SELECT project_code INTO v_project_code FROM projects WHERE id = NEW.project_id;
  SELECT COALESCE(MAX(
    (regexp_match(query_code, 'Q(\d+)$'))[1]::integer
  ), 0) + 1
  INTO v_seq
  FROM authority_queries WHERE project_id = NEW.project_id;
  NEW.query_code := v_project_code || '-Q' || v_seq;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS authority_queries_code_gen ON authority_queries;
CREATE TRIGGER authority_queries_code_gen
  BEFORE INSERT ON authority_queries
  FOR EACH ROW EXECUTE FUNCTION generate_query_code();

-- ============================================================
-- 7. QUERY POINTS — structured table format
-- ============================================================
CREATE TABLE IF NOT EXISTS query_points (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query_id      UUID NOT NULL REFERENCES authority_queries(id) ON DELETE CASCADE,
  point_order   SMALLINT NOT NULL DEFAULT 1,
  description   TEXT NOT NULL,
  response      TEXT,
  responded_at  TIMESTAMPTZ,
  responded_by  UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE query_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read query_points"  ON query_points FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated write query_points" ON query_points FOR ALL    TO authenticated USING (TRUE);

-- ============================================================
-- 8. CANCEL REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS cancel_requests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  approved_by  UUID REFERENCES auth.users(id),
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  approved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cancel_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read cancel_requests"  ON cancel_requests FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated write cancel_requests" ON cancel_requests FOR ALL    TO authenticated USING (TRUE);

-- ============================================================
-- 9. DELETE REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS delete_requests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name   TEXT NOT NULL,
  record_id    UUID NOT NULL,
  record_label TEXT,
  reason       TEXT NOT NULL,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  approved_by  UUID REFERENCES auth.users(id),
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  approved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE delete_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read delete_requests"  ON delete_requests FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated write delete_requests" ON delete_requests FOR ALL    TO authenticated USING (TRUE);

-- ============================================================
-- 10. SOI PRODUCTS — structured product list per client/project
-- ============================================================
CREATE TABLE IF NOT EXISTS soi_products (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id     UUID REFERENCES projects(id) ON DELETE SET NULL,
  sr_no          SMALLINT,
  product_name   TEXT NOT NULL,
  product_type   TEXT, -- Nutraceutical | Health Supplement | etc
  created_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE soi_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read soi_products"  ON soi_products FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated write soi_products" ON soi_products FOR ALL    TO authenticated USING (TRUE);

CREATE INDEX IF NOT EXISTS idx_soi_products_client ON soi_products(client_id);
CREATE INDEX IF NOT EXISTS idx_soi_products_project ON soi_products(project_id);

-- ============================================================
-- 11. FIX UNBLOCK BUG — approve_block_request function
-- ============================================================
CREATE OR REPLACE FUNCTION approve_block_request(
  p_request_id UUID,
  p_approved   BOOLEAN,
  p_note       TEXT DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_project_id UUID;
BEGIN
  SELECT project_id INTO v_project_id FROM block_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Block request not found'; END IF;

  UPDATE block_requests
  SET approved = p_approved, approved_at = now(), approved_by = auth.uid(), note = p_note
  WHERE id = p_request_id;

  IF p_approved THEN
    UPDATE projects SET
      is_blocked       = TRUE,
      block_started_at = now()
    WHERE id = v_project_id;
  END IF;
END;
$$;

-- Unblock function (separate, clean)
CREATE OR REPLACE FUNCTION unblock_project(p_project_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE projects SET
    is_blocked     = FALSE,
    block_type     = NULL,
    block_reason   = NULL,
    block_started_at = NULL,
    block_expires_at = NULL
  WHERE id = p_project_id;

  -- Mark all pending block requests for this project as resolved
  UPDATE block_requests
  SET approved = FALSE, note = COALESCE(note, 'Manually unblocked')
  WHERE project_id = p_project_id AND approved IS NULL;
END;
$$;
