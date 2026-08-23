-- 125 — "New WhatsApp reply" alerts. When a customer replies (whatsapp-inbound webhook),
-- notify the team so they don't have to keep the portal open. Channels are config-driven in
-- app_settings (empty value = that channel off). Email works immediately; WhatsApp activates
-- once the tps_new_reply utility template is approved and notify_reply_wa is set; SMS later
-- once a 2Factor DLT template is registered and notify_reply_sms is set.
insert into public.app_settings (key, value, description)
select v.key, v.value, v.description
from (values
  ('notify_reply_email',        'tarun@tpsxpert.com', 'Email for new-WhatsApp-reply alerts (empty = off)'),
  ('notify_reply_wa',           '',                   'WhatsApp number for reply alerts, digits with country code (empty = off; needs tps_new_reply approved)'),
  ('notify_reply_sms',          '',                   'SMS number for reply alerts (empty = off; needs a 2Factor DLT template)'),
  ('notify_reply_wa_template',  'tps_new_reply',      'Approved utility template used for WhatsApp reply alerts'),
  ('notify_reply_throttle_min', '10',                 'Minutes to suppress repeat alerts from the same sender')
) as v(key, value, description)
where not exists (select 1 from public.app_settings s where s.key = v.key);
