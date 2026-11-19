drop policy "read candidates" on public.candidates;
create policy "read candidates" on public.candidates for select to authenticated using (created_by = auth.uid() or public.can_access_candidate(id));