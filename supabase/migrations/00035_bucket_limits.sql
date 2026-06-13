-- Enforce upload size + MIME limits at the storage layer (2026-06-12 audit MEDIUM).
--
-- The 10 MB cap and accepted types were previously only advisory (returned to the
-- client and checked there). A crafted PUT to a signed upload URL could exceed
-- them. Setting file_size_limit / allowed_mime_types on the bucket makes the
-- limit server-enforced by Storage itself.
update storage.buckets
  set file_size_limit = 10485760, -- 10 MB
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf']
  where id = 'rx-files';

update storage.buckets
  set file_size_limit = 10485760, -- 10 MB
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/heic', 'image/heif']
  where id in ('qc-photos', 'return-photos');
