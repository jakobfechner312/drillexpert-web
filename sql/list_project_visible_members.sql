create or replace function public.list_project_visible_members(p_project_id uuid)
returns table(user_id uuid, role_in_project text, email text)
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
    join me on me.uid = pm.user_id
    where pm.project_id = p_project_id
    limit 1
  ),
  member_rows as (
    select
      pm.user_id,
      coalesce(pm.role_in_project, 'member')::text as role_in_project
    from public.project_members pm
    where pm.project_id = p_project_id
  ),
  owner_row as (
    select
      p.owner_id as user_id,
      'owner'::text as role_in_project
    from public.projects p
    where p.id = p_project_id
      and p.owner_id is not null
      and not exists (
        select 1
        from member_rows mr
        where mr.user_id = p.owner_id
      )
  ),
  all_rows as (
    select * from member_rows
    union all
    select * from owner_row
  )
  select
    ar.user_id,
    ar.role_in_project,
    pr.email
  from all_rows ar
  left join public.profiles pr on pr.id = ar.user_id
  where exists (select 1 from allowed)
  order by
    case when ar.role_in_project = 'owner' then 0 else 1 end,
    lower(coalesce(pr.email, '')),
    ar.user_id;
$$;

grant execute on function public.list_project_visible_members(uuid) to authenticated;
