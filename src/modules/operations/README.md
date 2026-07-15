# Operations Module (V2) — Active

FSSAI project delivery: projects, stages/clocks, blocks, transfers, tasks, attendance,
and the operational dashboards (Dashboard / Director / Operations board).

## Current → target mapping (files migrate incrementally; V1 unaffected today)
- Pages: `src/pages/projects/*`, `src/pages/operations/*`, `src/pages/director/*`,
  `src/pages/dashboard/*`, `src/pages/tasks/*`, `src/pages/attendance/*`
- Hooks: `useProjects`, `useProjectTransfers`, `useStageDocuments`, `useDocuments`,
  `useTasks`, `useAttendance`, `useFaceVerify`, `useDashboard`
- Libs: `src/lib/projectClock.ts`, `src/lib/attendanceGeo.ts`
