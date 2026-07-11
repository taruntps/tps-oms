-- CAPA S-1: recreate v_stage_timeline as SECURITY INVOKER (honours caller RLS).
create or replace view public.v_stage_timeline with (security_invoker = on) as
 SELECT st.id, st.project_id, st.stage_id, st.stage_code, st.clock_type,
    st.started_at, st.ended_at,
    round(EXTRACT(epoch FROM COALESCE(st.ended_at, now()) - st.started_at) / 86400.0, 2) AS duration_days,
    st.assigned_to, pr.name AS assignee_name,
    p.project_code, p.service_type, p.target_date, p.completed_date, p.status AS project_status,
    s.stage_name, s.stage_order, s.status AS stage_status, s.due_date AS stage_due_date
   FROM stage_timeline st
     JOIN projects p ON p.id = st.project_id
     LEFT JOIN stages s ON s.id = st.stage_id
     LEFT JOIN profiles pr ON pr.id = st.assigned_to;

-- CAPA S-5: pin search_path on 11 flagged functions (hardening; no behaviour change).
alter function public.auth_role() set search_path = public;
alter function public.fn_add_working_days(p_start date, p_days integer) set search_path = public;
alter function public.fn_notify_project_completed() set search_path = public;
alter function public.fn_notify_stage_assigned() set search_path = public;
alter function public.fn_set_client_code() set search_path = public;
alter function public.fn_uppercase_company_name() set search_path = public;
alter function public.generate_query_code() set search_path = public;
alter function public.has_role(VARIADIC roles user_role[]) set search_path = public;
alter function public.notify_project_created() set search_path = public;
alter function public.stage_timeline_calc_duration() set search_path = public;
alter function public.tasks_stamp_completed() set search_path = public;
