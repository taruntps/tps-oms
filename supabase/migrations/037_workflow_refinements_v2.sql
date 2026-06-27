-- Migration 037: workflow refinements round 2.
-- 1) Document Collection starts on EMPLOYEE clock (request not yet sent to client).
update stage_templates set clock_action = 'employee' where stage_code = 'DOC_COLLECT_VERIFY';
-- 3) Rename the form stage + it now has Start -> Complete (frontend handles behaviour).
update stage_templates set stage_name = 'Form Preparation & Completion to FSSAI' where stage_code = 'FORM_SUBMIT';

-- 6) Query code already = <project_code>-Q<n>; also stamp round_no to match so the
--    status<->query binding can reference a stable number.
create or replace function generate_query_code()
returns trigger language plpgsql as $function$
declare v_project_code text; v_seq integer;
begin
  select project_code into v_project_code from projects where id = new.project_id;
  select coalesce(max((regexp_match(query_code, 'Q(\d+)$'))[1]::integer), 0) + 1
    into v_seq from authority_queries where project_id = new.project_id;
  new.round_no  := v_seq;
  new.query_code := v_project_code || '-Q' || v_seq;
  return new;
end;
$function$;
