-- Migration 085 — Wave 2 audit coverage (EXPAND, additive). Applied to staging.
-- Generic trigger: every INSERT/UPDATE/DELETE on a Wave-2 business table is written
-- to the existing audit_log. Satisfies the "every business event is audited" invariant.
create or replace function public.fn_audit_wave2()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  begin v_user := auth.uid(); exception when others then v_user := null; end;
  if (tg_op = 'DELETE') then
    insert into audit_log(user_id, action, table_name, record_id, old_data)
      values (v_user, 'DELETE', tg_table_name, old.id, to_jsonb(old));
    return old;
  elsif (tg_op = 'UPDATE') then
    insert into audit_log(user_id, action, table_name, record_id, old_data, new_data)
      values (v_user, 'UPDATE', tg_table_name, new.id, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into audit_log(user_id, action, table_name, record_id, new_data)
      values (v_user, 'INSERT', tg_table_name, new.id, to_jsonb(new));
    return new;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'crm_leads','crm_contacts','crm_activities',
    'sales_deals','sales_quotations','sales_orders',
    'finance_invoices','finance_invoice_lines','finance_credit_notes',
    'finance_govt_fees','finance_accounting_periods',
    'billing_provider_links','billing_sync_queue','billing_webhook_events'
  ] loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$I', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.fn_audit_wave2()', t);
  end loop;
end $$;
