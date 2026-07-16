// Core Platform — module contract types.
// Every feature module exports a `ModuleDef` (via its index.ts) describing its
// nav entries, routes, and permission keys. The registry (core/registry.ts)
// composes these so App/Sidebar/Router never hard-code module knowledge.
import type { RouteObject } from 'react-router-dom'

/** A single sidebar nav entry contributed by a module. */
export interface NavEntry {
  /** Router path to navigate to (e.g. '/operations'). */
  to: string
  /** Human-readable label shown in the sidebar. */
  label: string
  /** Material Symbols ligature name for the icon. */
  icon: string
  /** Roles allowed to see this entry (omit = visible to all authenticated users). */
  roles?: string[]
  /** Optional granular permission key required to see this entry. */
  permission?: string
}

/** The public contract a feature module exposes to the platform. */
export interface ModuleDef {
  /** Stable unique module key (e.g. 'operations'). */
  key: string
  /** Sidebar nav entries owned by this module. */
  nav: NavEntry[]
  /** Route table owned by this module (mounted into the protected route tree). */
  routes: RouteObject[]
  /** Permission keys this module defines. */
  permissions: string[]
}
