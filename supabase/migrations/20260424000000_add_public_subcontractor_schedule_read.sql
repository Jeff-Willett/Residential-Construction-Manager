-- Public read-only schedule access for the /subs subcontractor view.
-- This intentionally grants anonymous SELECT only. Writes remain limited by
-- the existing authenticated approved-user RLS policies.

alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.dependencies enable row level security;

drop policy if exists "Public can read projects for subcontractor schedule" on public.projects;
drop policy if exists "Public can read tasks for subcontractor schedule" on public.tasks;
drop policy if exists "Public can read dependencies for subcontractor schedule" on public.dependencies;

create policy "Public can read projects for subcontractor schedule"
on public.projects
for select
to anon
using (true);

create policy "Public can read tasks for subcontractor schedule"
on public.tasks
for select
to anon
using (true);

create policy "Public can read dependencies for subcontractor schedule"
on public.dependencies
for select
to anon
using (true);

grant select on table public.projects to anon;
grant select on table public.tasks to anon;
grant select on table public.dependencies to anon;
