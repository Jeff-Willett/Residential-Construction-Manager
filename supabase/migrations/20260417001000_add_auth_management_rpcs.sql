create or replace function public.get_my_app_access()
returns table (
  email text,
  role text,
  is_active boolean
)
language sql
security definer
set search_path = public
as $$
  select
    au.email,
    au.role,
    au.is_active
  from public.app_users au
  where lower(au.email) = public.current_user_email()
  limit 1;
$$;

create or replace function public.list_app_users()
returns table (
  id uuid,
  email text,
  role text,
  is_active boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    au.id,
    au.email,
    au.role,
    au.is_active,
    au.created_at
  from public.app_users au
  where public.is_active_app_user()
  order by lower(au.email);
$$;

create or replace function public.add_app_user(input_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
begin
  if not public.is_active_app_user() then
    raise exception 'not authorized';
  end if;

  normalized_email := lower(trim(input_email));

  if normalized_email = '' then
    raise exception 'email is required';
  end if;

  insert into public.app_users (email, role, is_active)
  values (normalized_email, 'admin', true)
  on conflict ((lower(email))) do update
    set is_active = true;
end;
$$;

create or replace function public.delete_app_user(input_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_email text;
begin
  if not public.is_active_app_user() then
    raise exception 'not authorized';
  end if;

  select email into target_email
  from public.app_users
  where id = input_user_id;

  if target_email is null then
    return;
  end if;

  if lower(target_email) = 'jpwillett@gmail.com' then
    raise exception 'protected user cannot be removed';
  end if;

  delete from public.app_users
  where id = input_user_id;
end;
$$;

grant execute on function public.get_my_app_access() to authenticated;
grant execute on function public.list_app_users() to authenticated;
grant execute on function public.add_app_user(text) to authenticated;
grant execute on function public.delete_app_user(uuid) to authenticated;
