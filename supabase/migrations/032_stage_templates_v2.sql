-- Migration 032: Workflow Redesign Phase 2a — new stage_templates for all 7 types
-- + generation trigger that copies stage_kind/clock/skippable, inits doc_status,
-- and computes due dates in WORKING days. Affects only NEW projects.
--
-- stage_kind taxonomy (frontend renders per kind):
--   doc_collection | draft_approval | work | form_submit | fee_submit | fee |
--   fee_optional | submit_fssai | status_fssai | review_loop | dtm | client_review |
--   entry | appeal
-- clock_action ∈ {employee, client, authority} (maps to clock_type).

delete from stage_templates;

insert into stage_templates (service_type, stage_order, stage_name, stage_code, default_days, stage_kind, clock_action, is_skippable) values
-- New Application
('New Application',1,'Document Collection & Verification','DOC_COLLECT_VERIFY',7,'doc_collection','client',false),
('New Application',2,'Draft Preparation & Client Approval','DRAFT_PREP_APPROVAL',2,'draft_approval','employee',false),
('New Application',3,'Form Submission to FSSAI','FORM_SUBMIT',1,'form_submit','employee',false),
('New Application',4,'Fee Payment','FEE_PAYMENT',2,'fee_submit','employee',false),
('New Application',5,'Status at FSSAI','STATUS_FSSAI',null,'status_fssai','authority',false),
('New Application',6,'Licence Issued','LICENCE_ISSUED',1,'entry','employee',false),
-- Modification (same as New Application)
('Modification',1,'Document Collection & Verification','DOC_COLLECT_VERIFY',7,'doc_collection','client',false),
('Modification',2,'Draft Preparation & Client Approval','DRAFT_PREP_APPROVAL',2,'draft_approval','employee',false),
('Modification',3,'Form Submission to FSSAI','FORM_SUBMIT',1,'form_submit','employee',false),
('Modification',4,'Fee Payment','FEE_PAYMENT',2,'fee_submit','employee',false),
('Modification',5,'Status at FSSAI','STATUS_FSSAI',null,'status_fssai','authority',false),
('Modification',6,'Licence Issued','LICENCE_ISSUED',1,'entry','employee',false),
-- Renewal (no draft, no status-at-FSSAI)
('Renewal',1,'Document Collection & Verification','DOC_COLLECT_VERIFY',7,'doc_collection','client',false),
('Renewal',2,'Form Submission to FSSAI','FORM_SUBMIT',1,'form_submit','employee',false),
('Renewal',3,'Fee Payment','FEE_PAYMENT',2,'fee_submit','employee',false),
('Renewal',4,'Licence Issued','LICENCE_ISSUED',1,'entry','employee',false),
-- Annual Return
('Annual Return',1,'Details Collection & Verification','DOC_COLLECT_VERIFY',7,'doc_collection','client',false),
('Annual Return',2,'Form Submission to FSSAI','FORM_SUBMIT',1,'form_submit','employee',false),
('Annual Return',3,'Late Fee / Penalty (if applicable)','LATE_FEE',2,'fee_optional','employee',true),
('Annual Return',4,'Annual Return Submitted','RETURN_SUBMITTED',1,'entry','employee',false),
-- Form II
('Form II',1,'Document Collection & Verification','DOC_COLLECT_VERIFY',7,'doc_collection','client',false),
('Form II',2,'Application Draft Preparation & Client Approval','DRAFT_PREP_APPROVAL',2,'draft_approval','employee',false),
('Form II',3,'Technical Documents / Literature','TECH_DOCS',2,'work','employee',false),
('Form II',4,'Final Draft - Sign & Review by Client','FINAL_DRAFT_SIGN',3,'client_review','client',false),
('Form II',5,'Fee Payment','FEE_PAYMENT',2,'fee','employee',false),
('Form II',6,'Application Submitted to FSSAI','APP_SUBMITTED',1,'submit_fssai','employee',false),
('Form II',7,'Status at FSSAI','STATUS_FSSAI',null,'status_fssai','authority',false),
('Form II',8,'CEO Appeal','CEO_APPEAL',null,'appeal','authority',true),
('Form II',9,'Application Approval Issued','APPROVAL_ISSUED',1,'entry','employee',false),
-- Artwork (multi-product applied in Phase 5)
('Artwork',1,'Label Claim & Formula Received from Client','ART_LABEL_RECEIVED',3,'work','client',false),
('Artwork',2,'Draft Technical Matter (DTM) Preparation','ART_DTM',2,'dtm','employee',false),
('Artwork',3,'Artwork Received from Client','ART_RECEIVED',3,'work','client',false),
('Artwork',4,'Artwork Under Review','ART_REVIEW',2,'review_loop','employee',false),
('Artwork',5,'Send to Client','ART_SEND',1,'work','employee',false),
('Artwork',6,'Artwork Approved','ART_APPROVED',1,'entry','employee',false),
-- Claim Check
('Claim Check',1,'Label Claim & Formula Received from Client','CLAIM_RECEIVED',3,'work','client',false),
('Claim Check',2,'Claim Under Review','CLAIM_REVIEW',2,'review_loop','employee',false),
('Claim Check',3,'Claim Checked & Completed','CLAIM_COMPLETED',1,'entry','employee',false);

-- Generation trigger: copy kind/skippable/clock, init doc_status, working-day due dates
create or replace function create_stages_from_template()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into stages (project_id, stage_order, stage_name, stage_code, stage_kind,
                       is_skippable, active_clock, doc_status, due_date, assigned_to)
  select
    new.id, t.stage_order, t.stage_name, t.stage_code, t.stage_kind, t.is_skippable,
    coalesce(t.clock_action,'employee')::clock_type,
    case when t.stage_kind = 'doc_collection' then 'partial' else null end,
    case when t.default_days is null then null
         else fn_add_working_days(coalesce(new.start_date, current_date), t.cum_days::int) end,
    new.assigned_to
  from (
    select stage_order, stage_name, stage_code, stage_kind, is_skippable, clock_action, default_days,
           sum(default_days) over (order by stage_order) as cum_days
    from stage_templates
    where service_type = new.service_type
  ) t;
  return new;
end; $$;
