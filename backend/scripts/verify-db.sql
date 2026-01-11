select 'auth.users' as table, count(*) as rows from auth.users
union all
select 'public.projects' as table, count(*) as rows from public.projects
union all
select 'public.project_members' as table, count(*) as rows from public.project_members
union all
select 'public.profiles' as table, count(*) as rows from public.profiles
union all
select 'public.whiteboards' as table, count(*) as rows from public.whiteboards
union all
select 'public.tarefas' as table, count(*) as rows from public.tarefas;
