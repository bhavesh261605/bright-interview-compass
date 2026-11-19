
create type public.app_role as enum ('admin','recruiter','reviewer');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, email text, created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null, unique(user_id, role)
);
grant select, insert, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user_id) $$;

create policy "own or staff read profiles" on public.profiles for select to authenticated using (id=auth.uid() or public.is_staff(auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated using (id=auth.uid());
create policy "read own roles or admin" on public.user_roles for select to authenticated using (user_id=auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admin insert roles" on public.user_roles for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "admin delete roles" on public.user_roles for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, email) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)), new.email);
  if not exists (select 1 from public.user_roles where role='admin') then
    insert into public.user_roles(user_id, role) values (new.id,'admin');
  else
    insert into public.user_roles(user_id, role) values (new.id,'recruiter');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.job_roles (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text,
  experience_category text not null default 'both' check (experience_category in ('fresher','experienced','both')),
  competency_configuration jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.job_roles to authenticated;
grant all on public.job_roles to service_role;
alter table public.job_roles enable row level security;
create policy "staff read job roles" on public.job_roles for select to authenticated using (public.is_staff(auth.uid()));
create policy "admin write job roles" on public.job_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.salary_bands (
  id uuid primary key default gen_random_uuid(),
  job_role_id uuid not null references public.job_roles(id) on delete cascade,
  minimum_salary numeric not null check (minimum_salary >= 0),
  maximum_salary numeric not null,
  currency text not null default 'INR',
  effective_from date not null default current_date,
  is_active boolean not null default true,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (maximum_salary >= minimum_salary)
);
create index on public.salary_bands(job_role_id);
grant select, insert, update, delete on public.salary_bands to authenticated;
grant all on public.salary_bands to service_role;
alter table public.salary_bands enable row level security;
create policy "staff read bands" on public.salary_bands for select to authenticated using (public.is_staff(auth.uid()));
create policy "admin write bands" on public.salary_bands for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null, email text not null, phone text,
  job_role_id uuid references public.job_roles(id) on delete set null,
  resume_path text,
  experience_level text not null check (experience_level in ('fresher','experienced')),
  years_of_experience numeric not null default 0 check (years_of_experience >= 0 and years_of_experience <= 6),
  current_company text, current_location text,
  skills text[] not null default '{}',
  recruiter_notes text,
  notice_period_days integer, earliest_joining_date date,
  current_compensation numeric, expected_compensation numeric,
  availability text,
  status text not null default 'new' check (status in ('new','ready','in_progress','evaluation_pending','human_review','recommended','not_recommended','on_hold')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.candidates(created_by);
create index on public.candidates(status);
grant select, insert, update, delete on public.candidates to authenticated;
grant all on public.candidates to service_role;
alter table public.candidates enable row level security;

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  job_role_id uuid references public.job_roles(id) on delete set null,
  interviewer_id uuid not null default auth.uid(),
  experience_category text not null check (experience_category in ('fresher','experienced')),
  interview_type text not null default 'HR Round',
  duration_minutes integer not null default 30,
  role_context text,
  status text not null default 'in_progress' check (status in ('in_progress','completed','evaluated','evaluation_failed')),
  current_section text not null default 'introduction',
  state jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(), completed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index one_active_interview on public.interviews(candidate_id) where status='in_progress';
grant select, insert, update on public.interviews to authenticated;
grant all on public.interviews to service_role;
alter table public.interviews enable row level security;

create table public.interview_messages (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  sender_type text not null check (sender_type in ('ai','candidate','system')),
  message text not null,
  sequence_number integer not null,
  client_message_id text,
  section text,
  created_at timestamptz not null default now(),
  unique (interview_id, sequence_number),
  unique (interview_id, client_message_id)
);
grant select, insert on public.interview_messages to authenticated;
grant all on public.interview_messages to service_role;
alter table public.interview_messages enable row level security;

create table public.interview_evaluations (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null unique references public.interviews(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  competency_scores jsonb not null, strengths jsonb not null default '[]', weaknesses jsonb not null default '[]',
  summary text not null, red_flags jsonb not null default '[]', missing_information jsonb not null default '[]',
  details jsonb not null default '{}',
  recommendation text not null check (recommendation in ('recommend_final','hold_review','not_recommended')),
  model text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.interview_evaluations to authenticated;
grant all on public.interview_evaluations to service_role;
alter table public.interview_evaluations enable row level security;

create table public.scorecards (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  interview_id uuid not null unique references public.interviews(id) on delete cascade,
  expected_salary numeric, salary_currency text,
  band_min numeric, band_max numeric,
  salary_alignment text not null default 'band_not_configured' check (salary_alignment in ('within_band','below_band','above_band','band_not_configured','pending_review')),
  final_recommendation text not null check (final_recommendation in ('recommend_final','hold_review','not_recommended')),
  review_required boolean not null default false,
  review_reasons text[] not null default '{}',
  reviewer_status text not null default 'not_required' check (reviewer_status in ('not_required','pending','approved','rejected','info_requested','returned')),
  final_round_outcome text check (final_round_outcome in ('progressed','not_progressed')),
  ai_notes text,
  verified_items jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
grant select, insert, update on public.scorecards to authenticated;
grant all on public.scorecards to service_role;
alter table public.scorecards enable row level security;

create table public.reviewer_notes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  interview_id uuid references public.interviews(id) on delete cascade,
  reviewer_id uuid not null default auth.uid(),
  note_type text not null default 'recruiter' check (note_type in ('recruiter','reviewer')),
  note text not null,
  created_at timestamptz not null default now()
);
grant select, insert on public.reviewer_notes to authenticated;
grant all on public.reviewer_notes to service_role;
alter table public.reviewer_notes enable row level security;

create table public.review_actions (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null references public.scorecards(id) on delete cascade,
  reviewer_id uuid not null default auth.uid(),
  action text not null, previous_status text, new_status text, comments text,
  created_at timestamptz not null default now()
);
grant select, insert on public.review_actions to authenticated;
grant all on public.review_actions to service_role;
alter table public.review_actions enable row level security;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid default auth.uid(), action text not null, entity_type text not null, entity_id uuid,
  metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "staff insert audit" on public.audit_logs for insert to authenticated with check (public.is_staff(auth.uid()) and actor_id=auth.uid());
create policy "admin read audit" on public.audit_logs for select to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.app_settings (
  key text primary key, value jsonb not null, updated_at timestamptz not null default now()
);
grant select, insert, update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
create policy "staff read settings" on public.app_settings for select to authenticated using (public.is_staff(auth.uid()));
create policy "admin write settings" on public.app_settings for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
insert into public.app_settings(key, value) values ('ai_model', '"google/gemini-3-flash-preview"'), ('competency_weights', '{"communication":1,"motivation":1,"experience":1,"problem_solving":1,"teamwork":1,"job_competency":1,"availability":1,"salary_alignment":1}');

-- access helper
create or replace function public.can_access_candidate(_cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.candidates c where c.id=_cid and (
    public.has_role(auth.uid(),'admin') or c.created_by=auth.uid()
    or (public.has_role(auth.uid(),'reviewer') and exists (select 1 from public.scorecards s where s.candidate_id=c.id))
  )) $$;

create policy "read candidates" on public.candidates for select to authenticated using (public.can_access_candidate(id));
create policy "recruiter insert candidates" on public.candidates for insert to authenticated with check ((public.has_role(auth.uid(),'recruiter') or public.has_role(auth.uid(),'admin')) and created_by=auth.uid());
create policy "owner update candidates" on public.candidates for update to authenticated using (public.has_role(auth.uid(),'admin') or created_by=auth.uid() or (public.has_role(auth.uid(),'reviewer') and public.can_access_candidate(id)));
create policy "admin delete candidates" on public.candidates for delete to authenticated using (public.has_role(auth.uid(),'admin') or created_by=auth.uid());

create policy "read interviews" on public.interviews for select to authenticated using (public.can_access_candidate(candidate_id));
create policy "insert interviews" on public.interviews for insert to authenticated with check (public.can_access_candidate(candidate_id) and interviewer_id=auth.uid() and not public.has_role(auth.uid(),'reviewer') or (public.has_role(auth.uid(),'admin') and interviewer_id=auth.uid()));
create policy "update interviews" on public.interviews for update to authenticated using (public.can_access_candidate(candidate_id));

create policy "read messages" on public.interview_messages for select to authenticated using (exists (select 1 from public.interviews i where i.id=interview_id and public.can_access_candidate(i.candidate_id)));
create policy "insert messages" on public.interview_messages for insert to authenticated with check (exists (select 1 from public.interviews i where i.id=interview_id and i.status='in_progress' and public.can_access_candidate(i.candidate_id)));

create policy "read evals" on public.interview_evaluations for select to authenticated using (public.can_access_candidate(candidate_id));
create policy "write evals" on public.interview_evaluations for insert to authenticated with check (public.can_access_candidate(candidate_id));
create policy "update evals" on public.interview_evaluations for update to authenticated using (public.can_access_candidate(candidate_id));

create policy "read scorecards" on public.scorecards for select to authenticated using (public.can_access_candidate(candidate_id));
create policy "insert scorecards" on public.scorecards for insert to authenticated with check (public.can_access_candidate(candidate_id));
create policy "update scorecards" on public.scorecards for update to authenticated using (public.can_access_candidate(candidate_id));

create policy "read notes" on public.reviewer_notes for select to authenticated using (public.can_access_candidate(candidate_id));
create policy "insert notes" on public.reviewer_notes for insert to authenticated with check (public.can_access_candidate(candidate_id) and reviewer_id=auth.uid());

create policy "read review actions" on public.review_actions for select to authenticated using (exists (select 1 from public.scorecards s where s.id=scorecard_id and public.can_access_candidate(s.candidate_id)));
create policy "reviewer insert actions" on public.review_actions for insert to authenticated with check (reviewer_id=auth.uid() and (public.has_role(auth.uid(),'reviewer') or public.has_role(auth.uid(),'admin')));

-- storage policies for private resumes bucket
create policy "staff read resumes" on storage.objects for select to authenticated using (bucket_id='resumes' and public.is_staff(auth.uid()));
create policy "staff upload resumes" on storage.objects for insert to authenticated with check (bucket_id='resumes' and public.is_staff(auth.uid()));
create policy "staff update resumes" on storage.objects for update to authenticated using (bucket_id='resumes' and public.is_staff(auth.uid()));
