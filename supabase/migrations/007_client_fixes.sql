-- ============================================================
-- MIGRATION 007 — Client Module Fixes
-- Adds: gstin_is_placeholder, can_edit_clients, ALL CAPS trigger
-- ============================================================

-- 1. Add gstin_is_placeholder to clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS gstin_is_placeholder BOOLEAN NOT NULL DEFAULT false;

-- 2. Add can_edit_clients to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS can_edit_clients BOOLEAN NOT NULL DEFAULT false;

-- 3. ALL CAPS trigger for company_name
CREATE OR REPLACE FUNCTION fn_uppercase_company_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.company_name := UPPER(NEW.company_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_uppercase_company_name ON clients;
CREATE TRIGGER trg_uppercase_company_name
  BEFORE INSERT OR UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION fn_uppercase_company_name();

-- 4. Backfill: uppercase all existing company names
UPDATE clients SET company_name = UPPER(company_name)
  WHERE company_name <> UPPER(company_name);
