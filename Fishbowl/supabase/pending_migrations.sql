-- Create public Storage bucket for Telestrations drawings
insert into storage.buckets (id, name, public)
  values ('drawings', 'drawings', true)
  on conflict (id) do nothing;

create policy "drawings public read" on storage.objects
  for select using (bucket_id = 'drawings');

create policy "drawings anon upload" on storage.objects
  for insert with check (bucket_id = 'drawings');
