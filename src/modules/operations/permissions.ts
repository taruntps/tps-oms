// Operations module — permission keys.
// Namespaced `operations.<entity>.<action>`; RLS in the DB is authoritative,
// these keys drive UI affordance (useCan) once the access layer consumes them.
// Derived from the existing project / stage / block / transfer flows.
export const OPERATIONS_PERMISSIONS = [
  // Projects
  'operations.project.view',
  'operations.project.create',
  'operations.project.edit',
  'operations.project.assign',
  'operations.project.transfer',
  // Stages
  'operations.stage.view',
  'operations.stage.action',
  'operations.stage.document',
  // Blocks (block/unblock requests + approvals)
  'operations.block.request',
  'operations.block.approve',
] as const

export type OperationsPermission = (typeof OPERATIONS_PERMISSIONS)[number]
