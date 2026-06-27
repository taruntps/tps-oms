-- Migration 039: rename Artwork stage 3.
update stage_templates set stage_name = 'Draft Artwork Received from Client'
  where service_type = 'Artwork' and stage_code = 'ART_RECEIVED';
