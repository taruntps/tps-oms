-- Migration 017: add the missing UPDATE policy on authority_queries
--
-- BUG: "Mark Responded → Save Response" failed with "Cannot coerce the result to a
-- single JSON object". authority_queries had only INSERT and SELECT policies — no
-- UPDATE policy — so the responded_at/response_note update matched 0 rows under RLS
-- and the returning .single() got nothing back.

drop policy if exists "authority_queries_update" on authority_queries;
create policy "authority_queries_update" on authority_queries
  for update using (
    has_role('super_admin','director','manager','executive')
    or exists (
      select 1 from projects p
      where p.id = authority_queries.project_id
        and (p.assigned_to = auth.uid() or p.manager_id = auth.uid())
    )
  );
