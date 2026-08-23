-- 126 — Per-employee notification channel preferences, toggled by admins in User Management.
-- Default true (everyone gets every channel). Enforced centrally: WhatsApp in send-whatsapp
-- (all internal alerts route through it), Email in urgent-alerts + daily-reminders. The in-app
-- bell is intentionally always on (it's the employee's own portal record).
alter table public.profiles
  add column if not exists notify_whatsapp boolean not null default true,
  add column if not exists notify_email    boolean not null default true;
