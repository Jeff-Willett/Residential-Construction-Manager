create or replace function public.is_active_app_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users
    where lower(email) = public.current_user_email()
      and is_active = true
  );
$$;

revoke all on function public.is_active_app_user() from public;
grant execute on function public.is_active_app_user() to authenticated;
