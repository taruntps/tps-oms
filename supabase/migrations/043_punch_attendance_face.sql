-- 043 — punch_attendance accepts + persists the face-match result and enforces it
-- server-side when face_match_required is on.
create or replace function public.punch_attendance(
  p_lat double precision, p_lng double precision, p_accuracy double precision,
  p_selfie_path text default null, p_device text default null,
  p_face_matched boolean default null, p_face_score numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_settings attendance_settings%rowtype;
  v_is_field boolean;
  v_office office_locations%rowtype;
  v_dist double precision;
  v_best_dist double precision := null;
  v_best_office uuid := null;
  v_within boolean := false;
  v_punch_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select * into v_settings from attendance_settings limit 1;
  select is_field_staff into v_is_field from profiles where id = v_user;

  if p_accuracy is null or p_accuracy > coalesce(v_settings.accuracy_threshold_m, 100) then
    raise exception 'Location accuracy too low (% m). Move to an open area and retry.', round(coalesce(p_accuracy, 9999));
  end if;

  for v_office in select * from office_locations where is_active loop
    v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat - v_office.latitude) / 2), 2) +
      cos(radians(v_office.latitude)) * cos(radians(p_lat)) *
      power(sin(radians(p_lng - v_office.longitude) / 2), 2)
    ));
    if v_best_dist is null or v_dist < v_best_dist then
      v_best_dist := v_dist; v_best_office := v_office.id; v_within := v_dist <= v_office.radius_m;
    end if;
  end loop;

  if coalesce(v_settings.selfie_required, false) and p_selfie_path is null then
    raise exception 'A selfie is required to punch.';
  end if;

  -- Face-match enforcement: if required, the punch must report a successful match.
  if coalesce(v_settings.face_match_required, false) and coalesce(p_face_matched, false) is not true then
    raise exception 'Face did not match your enrolled face. Please retry.';
  end if;

  if not coalesce(v_is_field, false) and not coalesce(v_within, false) then
    raise exception 'You are not at an office location (nearest is % m away).', round(coalesce(v_best_dist, 0));
  end if;

  insert into attendance_punches
    (user_id, punch_at, latitude, longitude, accuracy_m, distance_m, office_id, within_fence, is_field, selfie_path, device_info, face_matched, face_score)
  values
    (v_user, now(), p_lat, p_lng, p_accuracy, v_best_dist, v_best_office, coalesce(v_within,false), coalesce(v_is_field,false), p_selfie_path, p_device, p_face_matched, p_face_score)
  returning id into v_punch_id;

  return jsonb_build_object(
    'id', v_punch_id,
    'within_fence', coalesce(v_within, false),
    'distance_m', round(coalesce(v_best_dist, 0)),
    'is_field', coalesce(v_is_field, false)
  );
end; $function$;
