-- Storage buckets
insert into storage.buckets (id, name, public) values ('rx-files', 'rx-files', false);
insert into storage.buckets (id, name, public) values ('qc-photos', 'qc-photos', false);
insert into storage.buckets (id, name, public) values ('return-photos', 'return-photos', false);
insert into storage.buckets (id, name, public) values ('work-order-pdfs', 'work-order-pdfs', false);
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true);

-- RLS for rx-files bucket: reviewer/founder can read, service role writes (via signed URL)
create policy "Reviewer reads rx-files"
  on storage.objects for select using (
    bucket_id = 'rx-files' and
    public.has_role(array['founder', 'reviewer']::user_role[])
  );

-- RLS for qc-photos: lab roles can write, founder/lab can read
create policy "Lab writes qc-photos"
  on storage.objects for insert with check (
    bucket_id = 'qc-photos' and
    public.has_role(array['founder', 'lab_admin', 'lab_qc']::user_role[])
  );
create policy "Lab reads qc-photos"
  on storage.objects for select using (
    bucket_id = 'qc-photos' and
    public.has_role(array['founder', 'lab_admin', 'lab_operator', 'lab_qc']::user_role[])
  );

-- Product images: public read
create policy "Public reads product-images"
  on storage.objects for select using (
    bucket_id = 'product-images'
  );
