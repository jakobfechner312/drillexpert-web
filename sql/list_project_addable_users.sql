create or replace function public.list_project_addable_users(p_project_id uuid)
returns table(id uuid, email text)
language sql
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as uid
  ),
  allowed as (
    select 1
    from public.project_members pm
    join me on pm.user_id = me.uid
    where pm.project_id = p_project_id
      and pm.role_in_project = 'owner'
    limit 1
  )
  select p.id, p.email
  from public.profiles p
  where exists (select 1 from allowed)
    and p.email is not null
    and p.id not in (
      select pm.user_id
      from public.project_members pm
      where pm.project_id = p_project_id
    )
  order by lower(p.email);
$$;

grant execute on function public.list_project_addable_users(uuid) to authenticated;
