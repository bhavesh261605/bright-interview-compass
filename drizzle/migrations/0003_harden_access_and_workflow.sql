create or replace function public.can_access_candidate(_cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff(auth.uid()) and exists (select 1 from public.candidates c where c.id=_cid and (
    public.has_role(auth.uid(),'admin') or c.created_by=auth.uid()
    or (public.has_role(auth.uid(),'reviewer') and exists (select 1 from public.scorecards s where s.candidate_id=c.id))
  )) $$;

drop policy if exists "owner update candidates" on public.candidates;
create policy "owner update candidates" on public.candidates for update to authenticated
  using (public.is_staff(auth.uid()) and (public.has_role(auth.uid(),'admin') or created_by=auth.uid() or (public.has_role(auth.uid(),'reviewer') and public.can_access_candidate(id))));
drop policy if exists "admin delete candidates" on public.candidates;
create policy "admin delete candidates" on public.candidates for delete to authenticated
  using (public.has_role(auth.uid(),'admin') or (public.has_role(auth.uid(),'recruiter') and created_by=auth.uid()));

drop policy if exists "insert interviews" on public.interviews;
create policy "insert interviews" on public.interviews for insert to authenticated
  with check (interviewer_id=auth.uid() and public.can_access_candidate(candidate_id)
    and (public.has_role(auth.uid(),'recruiter') or public.has_role(auth.uid(),'admin')));

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, email) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)), new.email);
  if not exists (select 1 from public.user_roles where role='admin') then
    insert into public.user_roles(user_id, role) values (new.id,'admin');
  end if;
  return new;
end $$;

revoke insert, update, delete on public.interview_messages from authenticated;
revoke insert, update, delete on public.interview_evaluations from authenticated;
revoke insert, update on public.scorecards from authenticated;
grant update (ai_notes, verified_items, final_round_outcome, updated_at) on public.scorecards to authenticated;

alter table public.interviews add column if not exists expires_at timestamptz default (now() + interval '14 days');
alter table public.interviews add column if not exists revoked_at timestamptz;
alter table public.candidates add column if not exists is_demo boolean not null default false;
update public.candidates set is_demo = true where email like '%@aria-hr.demo';

insert into public.app_settings(key, value) values ('demo_enabled', 'true') on conflict (key) do nothing;

create or replace function public.can_access_resume(_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare _id uuid;
begin
  begin _id := split_part(_name, '/', 1)::uuid; exception when others then return false; end;
  return public.can_access_candidate(_id);
end $$;

drop policy if exists "staff read resumes" on storage.objects;
drop policy if exists "staff upload resumes" on storage.objects;
drop policy if exists "staff update resumes" on storage.objects;
create policy "candidate access read resumes" on storage.objects for select to authenticated using (bucket_id='resumes' and public.can_access_resume(name));
create policy "candidate access upload resumes" on storage.objects for insert to authenticated with check (bucket_id='resumes' and public.can_access_resume(name));
create policy "candidate access update resumes" on storage.objects for update to authenticated using (bucket_id='resumes' and public.can_access_resume(name));