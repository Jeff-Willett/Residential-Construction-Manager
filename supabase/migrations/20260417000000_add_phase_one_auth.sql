create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null default 'admin',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists app_users_email_lower_idx on public.app_users (lower(email));

alter table public.app_users enable row level security;

create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', auth.jwt() -> 'user_metadata' ->> 'email', ''));
$$;

create or replace function public.is_active_app_user()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.app_users
    where lower(email) = public.current_user_email()
      and is_active = true
  );
$$;

insert into public.app_users (email, role, is_active)
values ('jpwillett@gmail.com', 'admin', true)
on conflict ((lower(email))) do update
set role = excluded.role,
    is_active = excluded.is_active;

drop policy if exists "Enable all for all users" on public.projects;
drop policy if exists "Enable all for all users" on public.phase_templates;
drop policy if exists "Enable all for all users" on public.task_templates;
drop policy if exists "Enable all for all users" on public.subcontractors;
drop policy if exists "Enable all for all users" on public.template_dependencies;
drop policy if exists "Enable all for all users" on public.project_phases;
drop policy if exists "Enable all for all users" on public.tasks;
drop policy if exists "Enable all for all users" on public.dependencies;
drop policy if exists "Enable all for all users" on public.vendor_colors;

drop policy if exists "Approved users can manage projects" on public.projects;
drop policy if exists "Approved users can manage phase templates" on public.phase_templates;
drop policy if exists "Approved users can manage task templates" on public.task_templates;
drop policy if exists "Approved users can manage subcontractors" on public.subcontractors;
drop policy if exists "Approved users can manage template dependencies" on public.template_dependencies;
drop policy if exists "Approved users can manage project phases" on public.project_phases;
drop policy if exists "Approved users can manage tasks" on public.tasks;
drop policy if exists "Approved users can manage dependencies" on public.dependencies;
drop policy if exists "Approved users can manage vendor colors" on public.vendor_colors;
drop policy if exists "Approved users can read app users" on public.app_users;

create policy "Approved users can manage projects"
on public.projects
for all
to authenticated
using (public.is_active_app_user())
with check (public.is_active_app_user());

create policy "Approved users can manage phase templates"
on public.phase_templates
for all
to authenticated
using (public.is_active_app_user())
with check (public.is_active_app_user());

create policy "Approved users can manage task templates"
on public.task_templates
for all
to authenticated
using (public.is_active_app_user())
with check (public.is_active_app_user());

create policy "Approved users can manage subcontractors"
on public.subcontractors
for all
to authenticated
using (public.is_active_app_user())
with check (public.is_active_app_user());

create policy "Approved users can manage template dependencies"
on public.template_dependencies
for all
to authenticated
using (public.is_active_app_user())
with check (public.is_active_app_user());

create policy "Approved users can manage project phases"
on public.project_phases
for all
to authenticated
using (public.is_active_app_user())
with check (public.is_active_app_user());

create policy "Approved users can manage tasks"
on public.tasks
for all
to authenticated
using (public.is_active_app_user())
with check (public.is_active_app_user());

create policy "Approved users can manage dependencies"
on public.dependencies
for all
to authenticated
using (public.is_active_app_user())
with check (public.is_active_app_user());

create policy "Approved users can manage vendor colors"
on public.vendor_colors
for all
to authenticated
using (public.is_active_app_user())
with check (public.is_active_app_user());

create policy "Approved users can read app users"
on public.app_users
for select
to authenticated
using (public.is_active_app_user());
