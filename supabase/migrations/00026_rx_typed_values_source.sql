-- Provenance for the typed Rx values: 'manual' (customer typed them) or 'ocr'
-- (auto-read from the uploaded image and then confirmed by the customer).
-- Lets admin review scrutinize OCR-assisted values against the image. Typed
-- values are never authoritative for the lab regardless — an approved image is
-- always required (see generate-work-order / create-shipment).
-- Nullable: NULL means no typed values were submitted at all (distinct from
-- 'manual', which means the customer typed them).
alter table rx_files
  add column typed_values_source text
  check (typed_values_source is null or typed_values_source in ('manual', 'ocr'));
