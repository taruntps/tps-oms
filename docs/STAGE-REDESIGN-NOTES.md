# TPS-OMS Stage Redesign — live working notes

Status: COLLECTING (do NOT implement until user confirms ALL project types)
Started: 2026-06-27

Method: walk through each project type's stages live; user gives corrections; record here.
Order: New Application → (then the rest, one by one).

## Project types to cover
- [ ] New Application (in progress)
- [ ] Renewal
- [ ] Modification
- [ ] Annual Return
- [ ] Form II
- [ ] Artwork
- [ ] Claim Check
- [ ] (any NEW types the user adds)

## Corrections log
(per project type, recorded as the user confirms each)

### New Application
- pending user review...

#### CONFIRMED corrections — New Application
- MERGE old Stage 1 (Document Collection) + Stage 2 (Document Verification) into ONE stage:
  "Document Collection & Verification". Reason: verification is a parallel process done
  as documents come in, not a separate sequential step.
- This stage has a DOCUMENT STATUS dropdown:
    * "Partial received"  (some docs in, waiting for rest)
    * "Completed"         (all docs received & verified)
- GATING RULE: stage can be marked Complete ONLY when dropdown = "Completed".
  While "Partial received", the stage stays open.
- Purpose: see at a glance whether documents are fully received or still partial.
- OPEN QUESTION: default days for the merged stage? (old were 7 + 3). To confirm later.
- After merge, remaining order shifts up (old Stage 3 Form Filling becomes new Stage 2, etc.)

#### CONFIRMED (round 2) — New Application
- Merged Stage 1 "Document Collection & Verification" default days = 7.
- Rename: "Form Filling" -> "Draft Preparation"; "Client Approval of Form" -> "Draft Approval of Client".
- Remove the "Submit to FSSAI" clock button from early stages: Doc Collection&Verification,
  Draft Preparation, Draft Approval. FSSAI submit button first appears at "Form Submission to FSSAI".
- Clock buttons:
    * Stage 1 Document Collection & Verification -> CLIENT clock (waiting on client for docs).
    * Stage 2 Draft Preparation -> Employee. days = 1 (24h).
    * Stage 3 Draft Approval of Client -> CLIENT clock (assumed; awaiting confirm). days = 1.
- New running order (post-merge):
    1 Document Collection & Verification (7) [doc-status dropdown Partial/Completed]
    2 Draft Preparation (1)
    3 Draft Approval of Client (1)
    4 Form Submission to FSSAI (1) [FSSAI submit button starts here]
    5 Fee Payment (2)
    6 Scrutiny by Authority (30)
    7 Deficiency Reply if any (7)
    8 Inspection if required (14)
    9 Licence Issued (1)
- OPEN: confirm Stage 3 Draft Approval uses Client clock button.

#### CONFIRMED (round 3) — GLOBAL RULES + New Application
GLOBAL RULE A — Working-day timeline:
- Stage "days" = WORKING days, and due = END OF DAY of that working day (NOT 24h rolling).
- Example: 1-day stage started Fri 2pm, Sat+Sun off -> due Monday EOD.
- Weekends + holidays are EXCLUDED from timeline. Need config: weekly-offs + holiday list.
  (the due-date engine must skip non-working days). TO CONFIRM: weekly offs = Sat+Sun? + holiday list source.

GLOBAL RULE B — Per-stage clock (BUG FIX):
- Current bug: changing a stage's clock changes ALL stages (single project.active_clock).
- Required: clock is PER-STAGE. Each stage has its own clock; moving one doesn't affect others.
- Within a stage the clock can transition via buttons (e.g. Employee -> "Send to Client for Approval" -> Client).

New Application — MERGE Draft Preparation + Draft Approval of Client into ONE stage:
- "Draft Preparation & Client Approval".
- On start: Employee clock (draft prep). Button "Send to Client for Approval" -> Client clock (this stage only).
- Days: prep 1 + approval 1. TO CONFIRM: total = 2 working days?

New Application order (post all merges):
  1 Document Collection & Verification (7) [Client; doc-status Partial/Completed]
  2 Draft Preparation & Client Approval (~2) [Employee -> Send to Client -> Client]
  3 Form Submission to FSSAI (1) [FSSAI submit button starts here]
  4 Fee Payment (2)
  5 Scrutiny by Authority (30)
  6 Deficiency Reply if any (7)
  7 Inspection if required (14)
  8 Licence Issued (1)

#### CONFIRMED (round 4) — Holidays + Submission/Fee stages
HOLIDAYS:
- For now weekly off = Saturday + Sunday ONLY. Other/festival holidays deferred to HRM module (later).
- Build timeline engine to skip weekly-offs now, pluggable holiday list later.

New Application stage button/behavior changes:
- Stage "Form Submission to FSSAI": buttons = "Completed" ONLY. Remove "Move to Client" and "Submit to FSSAI".
- Stage "Fee Payment": remove "Mark Complete". Keep "Move to Client" + "Submit to FSSAI".
    * "Submit to FSSAI" = application officially SUBMITTED (real submission point); moves clock to FSSAI (-> Scrutiny).
    * BEFORE Submit to FSSAI, mandatory capture form:
        1. App Ref No.  (MUST sync with project_details.app_ref_no — same field, two-way)
        2. Fees amount paid
        3. Date (of payment/submission)
        4. Paid by: Client / TPS (dropdown)

Updated New Application order:
  1 Document Collection & Verification (7) [Client; doc-status Partial/Completed]
  2 Draft Preparation & Client Approval (~2) [Employee -> Send to Client -> Client]
  3 Form Submission to FSSAI (1) [button: Completed only]
  4 Fee Payment (2) [Move to Client + Submit to FSSAI; Submit captures App Ref No/Fees/Date/Paid-by; clock->FSSAI]
  5 Scrutiny by Authority (30)
  6 Deficiency Reply if any (7)
  7 Inspection if required (14)
  8 Licence Issued (1)

#### CONFIRMED (round 5) — FSSAI status + query loop (ARCHITECTURE)
Stage 4 (Fee Payment) App Ref No:
- App Ref No is PRE-FILLED read-only from the PROJECT HEADER (project.app_ref_no).
- If header app_ref_no is blank -> block "Submit to FSSAI", popup: "App Ref No cannot be blank — add it in the project header first." Never typed in the stage.

Stage 5 rename "Scrutiny by Authority" -> "Status at FSSAI":
- Auto-starts after Stage 4 Submit to FSSAI. Remove "Move to Client" button (only appears per-query).
- ONE stage that ABSORBS old Scrutiny + Deficiency Reply + Inspection (they are statuses, not separate stages).

DESIGN — "Status at FSSAI" = state machine + query loop:
A) Manual STATUS dropdown (updated as FSSAI portal changes), values:
   Document Scrutinisation, Pending at IO, Scrutinisation, Inspection Marked, Query Raised, Approved, (Rejected - proposed).
   Every status change LOGGED with date + by-whom (status history timeline).
B) QUERY LOOP (reuse authority_queries table, Q1..Qn with query_code):
   - On Query Raised: log query = number + received date + details.
   - Optional per-query "Move to Client" (case-by-case, NOT mandatory) when client input needed.
   - Prepare response = text + response date; Submit response to FSSAI -> status back to Document Scrutinisation.
   - Repeats unlimited times; ALL queries + responses preserved with dates (audit).
C) Exits: Approved -> Licence Issued -> project complete. (Rejected -> terminal, proposed.)

COMPLETION FIX (9/10 problem):
- Each stage status can be: pending / active / completed / not_required(skipped).
- Project completion = every stage is completed OR not_required.
- On Licence Issued, auto-mark any remaining pending optional stages (e.g. standalone Inspection) as "Not required".
- Progress shows 100%, never 9/10 due to a skipped optional stage.

OPEN CONFIRMATIONS:
- Status dropdown final value list (incl. Rejected?).
- OK that "Status at FSSAI" replaces separate Deficiency Reply + Inspection stages?

#### CONFIRMED (round 6) — status cycle + inspection placement
- FSSAI status CYCLE corrected: Document Scrutinisation <-> Pending at IO (loops between these two).
  Remove the separate "Scrutinisation" status.
- Final STATUS dropdown values: Document Scrutinisation, Pending at IO, Inspection Marked,
  Query Raised, Approved, Rejected(proposed).
- INSPECTION is NOT a separate stage. It is the "Inspection Marked" status inside "Status at FSSAI",
  selected only if FSSAI marks an inspection; after inspection -> back to Document Scrutinisation.
  If never marked, nothing pending -> no 9/10 issue.
- FINAL New Application stage list (6 stages):
   1 Document Collection & Verification (7) [Client; doc-status Partial/Completed]
   2 Draft Preparation & Client Approval (~2) [Employee -> Send to Client -> Client]
   3 Form Submission to FSSAI (1) [button: Completed only]
   4 Fee Payment (2) [Move to Client + Submit to FSSAI; Submit captures App Ref No(from header)/Fees/Date/Paid-by]
   5 Status at FSSAI [manual status cycle + query loop Q1..Qn + status history; exits Approved/Rejected]
   6 Licence Issued (1)

#### CONFIRMED (round 7) — final stage + locks
- "Rejected" status: KEEP (terminal, project closed as rejected).
- Draft Preparation & Client Approval = 2 working days (1 prep + 1 approval).
- LAST STAGE "Licence Issued": NO start button. It is an ENTRY FORM:
    * Licence No. (required)
    * Issue Date (required)
    * After both filled -> Submit -> stage complete + project complete.
- SAME "Licence Issued" entry behaviour applies to MODIFICATION project type's final stage.
- SUGGESTION (await user): on submit, also capture Expiry/Validity date and auto-create the
  licence under the client's Licences (so renewal-expiry reminders work). To confirm later.

### Renewal
#### CONFIRMED (round 1) — Renewal = New Application stages 1,3,4,5 (skip Draft Prep & Client Approval)
Renewal flow (renumbered), same behaviours as New Application:
  1 Document Collection & Verification (7) [Client; Partial/Completed; complete only when Completed]
  2 Form Submission to FSSAI (1) [Completed button only]
  3 Fee Payment (2) [Move to Client + Submit to FSSAI; captures App Ref No(from header)/Fees/Date/Paid-by]
  4 Status at FSSAI [status cycle Doc Scrutinisation<->Pending at IO + query loop + Approved/Rejected]
OPEN: does Renewal need a final "Licence Renewed" entry stage (Renewed Licence No + Issue/Validity date -> Submit)?
  User listed only 1,3,4,5 (no stage 6). Awaiting confirm.

#### CONFIRMED (round 2) — Renewal
- REMOVE Fee Payment stage. Flow goes Form Submission to FSSAI -> directly to Status at FSSAI ("does not go to Authority [fee step]").
- Renewal so far: 1 Document Collection & Verification, 2 Form Submission to FSSAI, 3 Status at FSSAI.
- OPEN (user will instruct): where the "Submit to FSSAI" action + App Ref/fee/date/paid-by capture goes; whether a final "Licence Renewed" entry stage exists.

#### CORRECTION + FINAL — Renewal  (supersedes round 2 above; round 2 was WRONG)
Renewal = New Application stages 1, 3, 4, 6 ONLY.
- KEEP Fee Payment. REMOVE Status at FSSAI (renewal does NOT go through FSSAI scrutiny/query loop).
- Also no Draft Preparation & Client Approval.
FINAL Renewal flow:
  1 Document Collection & Verification (7) [Client; Partial/Completed; complete only when Completed]
  2 Form Submission to FSSAI (1) [Completed button only]
  3 Fee Payment (2) [Move to Client + Submit to FSSAI; captures App Ref No(from header)/Fees/Date/Paid-by; clock->FSSAI]
  4 Licence Issued [NO start button; enter Licence No + Issue Date -> Submit -> stage+project complete]
Note: after Submit to FSSAI (stage 3) it goes straight to Licence Issued (stage 4) — no authority/status stage.

### Modification
#### CONFIRMED — Modification = SAME AS New Application (identical 6-stage flow + all behaviours)
  1 Document Collection & Verification (7) [Client; Partial/Completed]
  2 Draft Preparation & Client Approval (2) [Employee -> Send to Client -> Client]
  3 Form Submission to FSSAI (1) [Completed button only]
  4 Fee Payment (2) [Submit to FSSAI; App Ref(header)/Fees/Date/Paid-by]
  5 Status at FSSAI [status cycle + query loop + Approved/Rejected]
  6 Licence Issued [enter Licence No + Issue Date -> Submit]

### Annual Return
#### CONFIRMED — Annual Return (4 stages)
  1 Details Collection & Verification [Client; Partial/Completed; complete only when Completed]  (renamed from Document...)
  2 Form Submission to FSSAI [Completed button only]
  3 Late Fee / Penalty (if applicable) [SKIPPABLE: mark "Not Applicable" if none; if applicable -> amount paid + date MANDATORY; counts complete either way]
  4 Annual Return Submitted [enter submission DATE only -> Submit -> stage+project complete]
- No Status at FSSAI / no Draft / no Licence stage.
- Days per stage: TBD (not specified).

### GLOBAL HEADER / UI RULES (round 8)
- APP REF NO applicability: show ONLY for New Application (New License), Modification, Form II.
  Remove App Ref No (header field + submit-capture) for Renewal, Annual Return, Artwork, Claim Check.
  RECONCILE: Renewal "Submit to FSSAI" now captures fees/date/paid-by ONLY (no App Ref No).
- PROJECT NAME: remove the "Project Name *" field (no longer required/collected).
  Identify project by PROJECT TYPE + client + code (TPS-2026-XXXX).
  Rename label "Service Type" -> "Project Type" (same underlying service_type field).
  OPEN: how to handle existing project_name values on old projects (keep for display? migrate?).
- PROJECT TYPE BADGE: colour-code by type (rich colour, distinct per project type) in project list + header,
  so task type is identifiable at a glance.

### CORRECTION — App Ref No applicability (supersedes round 8)
- App Ref No appears for: New Application, RENEWAL, Modification, Form II.
- Removed only for: Annual Return, Artwork, Claim Check.
- Renewal "Submit to FSSAI" DOES capture App Ref No (revert earlier reconciliation).

### Artwork
#### CONFIRMED — Artwork (6 stages)
  1 Label Claim & Formula Received from Client [button: Mark Complete only]
  2 Draft Technical Matter (DTM) Preparation [button: Submit to Client -> clock to Client]
  3 Artwork Received from Client [button: Mark Complete]
  4 Artwork Under Review [REVIEW LOOP: review -> if corrections: Send corrections / Go to Client ->
      client revises -> back for review -> repeat -> Approve (final approval our/TPS side).
      RECORD EACH ROUND: round no, date sent to client, what corrected, date returned (full history).]
  5 Send to Client [send approved artwork to client]
  6 Artwork Approved [enter OUR final approval DATE -> Submit -> project complete]
- No App Ref No. Days per stage: TBD.

#### CORRECTION — Artwork Stage 4 revision recording (supersedes "record each round" details)
- DO NOT require text details per correction round (too hard to enter).
- Instead: each revision = a VERSIONED ATTACHMENT record:
    * Version No: auto V1, V2, V3 ... (increments each round)
    * Type tag: Correction sent / Revised artwork / Final approved
    * Attachment: artwork file, PDF or JPEG, same size/page limit as other client documents
    * Date: auto-stamped;  By: auto (uploader)
    * Optional one-line note allowed but NOT required.
- Stage 4 shows a VERSION TIMELINE (V1..Vn) each with view/download -> fully trackable & traceable.
- Files stored in private access-controlled bucket + RLS (reuse existing client-documents machinery).
- Covers both corrections we send and the final approved artwork we send.
- Feasibility: HIGH — reuses existing document attachment/storage/size-limit/viewer components.

#### CONFIRMED — Artwork multi-product + Product Name + DTM attachment
- PRODUCT NAME: required (per product).
- MULTI-PRODUCT: a single Artwork project can have "No. of Products" (default 1, set at creation).
  - If >1 product -> a SEPARATE parallel stage-track (the 6 artwork stages) per product, under ONE project.
  - Each product track is independent/parallel (different products at different stages).
  - Each product has its OWN versioned artwork revision attachments AND its own DTM attachment.
  - PROJECT complete when ALL products' tracks complete.
- BATCH RULE: No. of Products fixed at creation (that day's batch). New artwork next day from same client
  = create a NEW project (do not append to existing).
- DTM (Stage 2) gets an ATTACHMENT option (same versioned PDF/JPEG attachment machinery as artwork revisions).
- ARCHITECTURE: add a "products" layer under project (project_products: project_id, product_no, product_name, status);
  stages link to product (stages.product_id) for multi-product types; completion rolls up product->project.
  Reuse existing document-attachment/storage/size-limit/viewer for revisions + DTM.
- OPEN: does multi-product also apply to Claim Check? (confirm when we reach Claim Check)

#### CONFIRMED — Artwork per-product structure + version note
- Each product runs the FULL 6 artwork stages independently, in parallel.
  Project completes when ALL products are Approved.
- Attachment versions: FILE ONLY (version + file + auto date/by). NO text note.

### Claim Check
#### CONFIRMED — Claim Check (3 stages, simple, NO uploads)
  1 Label Claim & Formula Received from Client [button: Mark Complete]
  2 Claim Under Review [review LOOP: Send to Client <-> back -> Approved; clock toggle only;
      NO version recording, NO attachment; ends at "final claim approved"]
  3 Claim Checked & Completed [enter DATE OF COMPLETION -> Submit -> project complete]
- No document upload. No multi-product (single). No App Ref No. Days per stage: TBD.

### Form II
#### CONFIRMED (round 1, architect-corrected) — Form II
Pre-submission:
  1 Document Collection & Verification [Client; Partial/Completed; complete only when Completed]
  2 Application Draft Preparation & Client Approval [Employee draft -> Send to Client -> approved (loop)]
  3 Technical Documents / Literature [Employee; Start -> Mark Complete]
  4 Final Draft - Sign & Review by Client [send final draft to client for signature + review; Client]
  5 Fee Payment [amount + date + paid by (Client/TPS)]
Submission + Authority:
  6 Application Submitted to FSSAI [Submit to FSSAI; App Ref No mandatory(from header) + submission date; clock->FSSAI]
  7 Status at FSSAI [statuses: Scrutinisation, Technical Committee, Query Raised, Approved, Rejected;
      query loop received+response dates same as New License]
      -> Approved -> stage 9 (Approval Issued)
      -> Rejected -> stage 8 (CEO Appeal) opens
  8 CEO Appeal [ONLY if rejected; record: appeal filed date, hearing date received, hearing done,
      final decision (Approved/Rejected). Approved -> stage 9; Rejected -> project closed as rejected]
  9 Application Approval Issued [same App Ref No (from submission) + approval date -> Submit -> complete]
- Form II HAS App Ref No. No multi-product.
- OPEN CONFIRMS: Fee Payment captures amount too (not just date+paid-by)? CEO Appeal field set OK?

#### CONFIRMED (round 2) — Form II finals
- Stage 5 Fee Payment captures: amount + date + paid by (Client/TPS).
- CEO Appeal records 4 fields: appeal filed date, hearing date received, hearing done,
  final decision (Approved/Rejected). No attachment.
- FORM II COMPLETE.

## ALL 7 PROJECT TYPES MAPPED — collection complete (2026-06-27). Awaiting user confirmation to implement.

### GLOBAL — Form Submission extra fields + QUERY RECORDING SYSTEM (round 9)
FORM SUBMISSION TO FSSAI (New License + Modification ONLY) — add mandatory fields:
- No. of products - DOMESTIC (number)
- No. of products - EXPORT (number)
- Additional KOB added? Yes/No -> if Yes, KOB details (manual text)
- Mandatory before completing that stage (for those two types only).

QUERY RECORDING (Pro design) — SINGLE SOURCE for Status-at-FSSAI loop + Queries tab:
- One query = one row, numbered Q1..Qn (= S.No / version). "Query Raised" status opens the query form;
  Queries tab shows the table. NO duplication.
- Fields per query:
    * S.No (auto)
    * Received Date  -- MANUAL, MANDATORY (actual FSSAI date). System ASKS; NEVER uses entry/today date.
    * Query Type (Deficiency Letter / Technical Committee / Other)
    * Query Raised (text)
    * Attachment (optional PDF - deficiency letter)
    * Response (text)
    * Response Date (manual, mandatory when responding)
    * Status (Pending/Responded auto)
    * Response Due = Received Date + 30 days -> HIGH-PRIORITY reminder as it nears/overdue
- Table display: S.No | Received | Query Raised | Response | Response Date | Status.
- REPORTING (the real purpose): each query linked to CLIENT (company) + FSSAI REGIONAL OFFICE.
  Queries Report filterable by company / office / date range: counts, recurring types/themes,
  avg response time, full history, export Excel/PDF. Purpose: spot patterns + improve filing.
- OPEN: source of "FSSAI regional office" per project (add project field? derive from client state/licence?).

#### CONFIRMED — query report office + response clock
- FSSAI regional office: AUTO-DERIVED from the client's STATE (no manual field).
  (Report "by regional office" groups by client state / state->region mapping; can refine grouping later.)
- 30-day response clock: CALENDAR days (Due = Received Date + 30 calendar days). NOT working days.

#### CONFIRMED — query layout
- TABLE layout (S.No | Received | Query raised | Response | Responded | Status). One row per query (Q1..Qn).
- Query Raised + Response cells hold FULL DESCRIPTIVE TEXT (multi-line/paragraphs ok; cell wraps).
- Click a row to EXPAND: full query + response + attachment; expand is also where response text + response date are entered/edited.
- Entry flow: status "Query Raised" -> form asks Received Date(manual)+Query text+optional PDF -> creates Qn.
  Reply -> open Qn -> Response text + Response Date -> status flips to Responded.
- Same data powers Status-at-FSSAI loop + Queries report.

#### CORRECTION + FINAL — Query model is TWO-LEVEL (supersedes flat Q1..Qn)
ROUND (= one deficiency letter; maps to authority_queries):
  - round_no (Round 1,2,3 ... repeated FSSAI letters stack as new rounds)
  - received_date  -- MANUAL, MANDATORY (system ASKS; never entry/today date)
  - query_type (Deficiency Letter / Technical Committee / Other)
  - attachment (optional PDF of the letter)
  - response_submitted_date -- MANUAL, ONE PER ROUND (when we reply to the letter)
  - response_due = received_date + 30 CALENDAR days -> HIGH-PRIORITY reminder
  - status (Pending / Responded) auto
POINTS (= the S.No rows inside a round; maps to query_points), MULTIPLE per round:
  - S.No / point_order (1,2,3...)
  - Query text (descriptive)
  - Response text (descriptive)
DISPLAY: Queries tab groups by ROUND (date header + PDF + due badge), each round = a table of points
  (S.No | Query | Response). New letters from FSSAI = new round blocks below.
REPORTING: aggregate rounds+points by Client (company) and client-state region.
Reuses existing authority_queries (round) + query_points (points) tables.

#### CONFIRMED — Query recording LOCATION + STATUS-GATING linkage
- HOME of data: QUERIES TAB (full table + report). Entry is TRIGGERED from the Stage (Status at FSSAI) and BOUND to it.
- GATING (two-way bound, cannot get out of sync):
  RAISE: selecting status "Query Raised" immediately pops the query-round form (received date + >=1 point + optional PDF).
         Status does NOT change until the round is saved. Cancel -> status unchanged.
         => "Query Raised" can never exist without an actual query recorded.
  RESPOND: while a round is unanswered, status is LOCKED on "Query Raised".
         To advance status (back to Scrutinisation/Responded), system REQUIRES response text + response submitted date.
         => cannot clear/advance a query without recording the response.
- Solves "employee marks status but forgets to enter the query/response."
- Same record shows in Queries tab + feeds the report automatically.

## REFINEMENTS ROUND 2 (2026-06-27) — New Application + Modification (awaiting command to implement)
1. On project creation clock starts EMPLOYEE (not client). Doc Collection stage gets a
   "Document list sent to client" action -> moves clock to CLIENT. (button inside the stage)
2. Doc Collection clock by doc_status: Partial -> clock Client; Completed -> clock Employee;
   Mark Complete only when Completed; once complete -> irreversible.
3. Rename "Form Submission to FSSAI" -> "Form Preparation & Completion to FSSAI"; add Start button
   (prep can begin earlier) then Mark Complete (kind work-like).
4. Fee Payment "Paid by" default = TPS (order TPS, Client).
5. Status at FSSAI: after Submit-to-FSSAI auto-set fssai_status = 'Document Scrutinisation'.
6. QUERY<->STATUS HARD BINDING:
   - Query rounds numbered <project_code>-Q1, -Q2 ... (e.g. TPS-2026-0010-Q1) replacing Round N.
   - To set status 'Query Raised': dropdown of EXISTING recorded query numbers (from Queries tab);
     cannot set Query Raised unless a query round exists. Select the query no -> status Query Raised (linked).
   - Saving a response: confirmation popup; ALL response cells must be filled (block empty); once saved
     LOCKED (admin-only edit).
   - On response saved -> status auto flips Query Raised -> Document Scrutinisation.
   - While response not saved -> status cannot move off Query Raised.
   - Next query -> Doc Scrutinisation -> Query Raised again -> creates -Q2, etc.
7. Approved / Rejected -> confirmation popup before applying (Approved still locks after).
OPEN CONFIRMS: (a) point1 action is a button inside Doc Collection stage; (b) query no format = <project_code>-Q<n>.

#### IMPLEMENTED & LIVE (2026-06-27) — refinements round 2 all done (mig 037). Verified on live DB + deployed.
