-- Provenance for the typed Rx values: 'manual' (customer typed them) or 'ocr'
-- (auto-read from the uploaded image and then confirmed by the customer).
-- Lets admin review scrutinize OCR-assisted values against the image. Typed
-- values are never authoritative for the lab regardless — an approved image is
-- always required (see generate-work-order / create-shipment).
alter table rx_files
  add column typed_values_source text not null default 'manual'
  check (typed_values_source in ('manual', 'ocr'));
