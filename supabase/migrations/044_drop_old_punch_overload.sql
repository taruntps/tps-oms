-- 044 — Migration 043 added two params to punch_attendance, so `create or replace`
-- created a NEW 7-arg overload instead of replacing the 5-arg one. The stale 5-arg
-- function does NOT enforce face-match (latent bypass) and makes RPC resolution
-- ambiguous. Drop it so only the face-aware 7-arg version remains.
drop function if exists public.punch_attendance(
  double precision, double precision, double precision, text, text
);
