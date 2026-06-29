-- Migration 049: let all staff (except auditor) read ONLY the drive_main_folder_id
-- setting, so non-admins (e.g. executives) see the "Create Drive Folder" button.
-- Other app_settings rows (WhatsApp/BSP config, etc.) stay manager+ only.
-- RLS SELECT policies are permissive (OR'd), so this widens read for just one key.

create policy "all_staff_read_drive_main_folder" on app_settings
  for select using (
    key = 'drive_main_folder_id'
    and has_role('super_admin','director','manager','executive','accounts','hr')
  );
