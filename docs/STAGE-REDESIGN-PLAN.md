# TPS-OMS Workflow Redesign — Implementation Plan

Source of truth for WHAT to build: `STAGE-REDESIGN-NOTES.md` (all 7 types + global rules).
This doc = HOW to build it safely, in phases, on a live production DB (158 clients).

## Cons / risks eliminated by the design (and how)
1. **Global clock bug** (one project.active_clock for all stages) → move to **per-stage clock** (`stages.active_clock`). Each stage owns its clock; changing one never affects others.
2. **Hardcoded stage-name logic** in StageCard (FSSAI_SUBMIT_STAGES etc.) → drive ALL logic from **stage_code + stage_kind**, never stage_name. New types never require frontend edits.
3. **"9/10" completion** → completion = every stage `completed` OR `not_required`; on project completion auto-mark skipped optional stages not_required; guard against blocked/cancelled.
4. **Out-of-sync status vs records** → status changes are **gated** (can't mark Query Raised without recording the query; can't advance without the response; can't complete Doc Collection unless status=Completed; can't Submit-to-FSSAI without App Ref No in header).
5. **Free-text service_type** → DB enum/lookup so template lookup never breaks on a typo.
6. **project_name NOT NULL** blocks removal → relax to default '' (keep column for back-compat, stop collecting it; show Project Type instead).
7. **Multi-product confusion** → a products layer (`project_products`) with per-product parallel stage tracks; completion rolls up product→project.
8. **Versioned files** → reuse the proven client-documents storage/RLS/size-limit machinery for stage/artwork/DTM/query attachments.

## Bugs found (from code investigation) — disposition
- B1 global clock → FIXED (per-stage clock, Phase 2)
- B2 project_name NOT NULL → FIXED (relax, Phase 1)
- B3 service_type free-text → FIXED (enum/lookup, Phase 1)
- B4 stage.clock_action ambiguous → clarified/repurposed as expected owner (Phase 2)
- B5 hardcoded stage names → FIXED (stage_code/kind, Phase 2)
- B6 app_ref_no ownership → project-level, sourced from header, submission-gated (Phase 3)
- B7 query_points UI incomplete → FIXED (rounds→points table + gating, Phase 4)
- B8 awaiting_client_flag dual source → collapse into per-stage clock (Phase 2)
- B9 completion ignores blocked/cancelled → FIXED (Phase 1)
- B10 payment status zero-quote → FIXED (Phase 1)

## Phased build (each phase: build → verify on DB → commit → report)
- **Phase 1 — Foundation (additive, safe):** service_type enum/lookup; relax project_name; completion-logic fixes (B9,B10, not_required); per-stage clock + doc_status + stage_kind columns (additive, defaults); project_products table; query round/point field alignment (response_submitted_date, manual received_date already exists); working-day due-date helper fn. Existing projects untouched.
- **Phase 2 — Stage engine + templates:** rewrite stage_templates for all 7 confirmed flows (stage_kind: work / doc_collection / submit_fssai / status_fssai / fee / entry / review_loop); per-stage clock buttons driven by stage_code/kind (kills B1,B5,B8); doc-status Partial/Completed gating; working-day timeline applied; Licence Issued as entry form (no Start).
- **Phase 3 — Submission + Fee + header:** Submit-to-FSSAI capture (App Ref No from header w/ block, fees/date/paid-by, domestic/export product counts + KOB for New License/Modification); header changes (drop Project Name, rename Service Type→Project Type, colour-coded type badge, App Ref No only for 4 types).
- **Phase 4 — Status at FSSAI + Query system:** status state machine per type; two-level query (rounds→points) table + status-gating linkage; 30-calendar-day high-priority reminder; CEO appeal branch (Form II); Queries report (by company / client-state region).
- **Phase 5 — Artwork multi-product + attachments:** product layer + parallel tracks; versioned PDF/JPEG attachments (artwork revisions + DTM) reusing documents machinery; Claim Check simple loop.

## Risk controls (production)
- All Phase-1 changes are **additive/back-compat**; existing 158 clients & live projects unaffected.
- New stage_templates affect **only newly created projects**; old projects keep their stages.
- Every phase verified on the live DB with probe data (create→assert→cleanup) before commit, per the project charter (build validation, regression, live validation).
- Deploy per phase; `/code-review` after each phase's code.
