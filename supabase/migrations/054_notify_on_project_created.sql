-- Migration 054: In-app notifications when a new project is created
-- Fires immediately on INSERT → inserts a project_assigned notification
-- for the assigned executive and (separately) the manager if different.
-- The urgent-alerts edge function picks these up within the hour and emails them.

CREATE OR REPLACE FUNCTION notify_project_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify assigned executive
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, reference_id, reference_type)
    VALUES (
      NEW.assigned_to,
      'project_assigned',
      'New project assigned to you',
      NEW.project_code || COALESCE(' — ' || NEW.service_type, '') || ' has been created and assigned to you.',
      NEW.id,
      'project'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Notify manager separately (only if different from assignee)
  IF NEW.manager_id IS NOT NULL AND NEW.manager_id IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO notifications (user_id, type, title, body, reference_id, reference_type)
    VALUES (
      NEW.manager_id,
      'project_assigned',
      'New project under your management',
      NEW.project_code || COALESCE(' — ' || NEW.service_type, '') || ' has been created.',
      NEW.id,
      'project'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS projects_notify_created ON projects;
CREATE TRIGGER projects_notify_created
  AFTER INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION notify_project_created();
