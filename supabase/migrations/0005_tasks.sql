-- 0005_tasks: task management. One task covers many clients, each ticked off
-- on its own. Status follows the ticks, repeating tasks create their next copy,
-- assignments/mentions notify people, and every change lands in activity_log.
-- VAs and writers only see their own tasks and the clients in them.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.task_status as enum ('todo', 'in_progress', 'waiting_on_client', 'done');
create type public.task_priority as enum ('low', 'normal', 'high');
create type public.task_type as enum (
  'backlinks', 'google_profile', 'content', 'reviews', 'connections', 'reports',
  'client_follow_up', 'other'
);
create type public.task_repeat as enum ('none', 'weekdays', 'weekly', 'monthly');
create type public.notification_kind as enum ('task_assigned', 'task_mentioned', 'task_commented');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 1001) unique,
  title text not null check (char_length(title) between 3 and 160),
  description text check (description is null or char_length(description) <= 4000),
  steps text[] not null default '{}' check (cardinality(steps) <= 30),
  type public.task_type not null default 'other',
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'normal',
  assignee_id uuid references public.team_members (id) on delete set null,
  due_on date,
  repeat public.task_repeat not null default 'none',
  previous_task_id uuid unique references public.tasks (id) on delete set null,
  completed_at timestamptz,
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.tasks is 'Work for the team. One task can cover many clients (task_clients).';

create table public.task_clients (
  task_id uuid not null references public.tasks (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  done_at timestamptz,
  done_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (task_id, client_id)
);
comment on table public.task_clients is 'The clients a task covers; each is ticked off separately.';

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid references public.team_members (id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.team_members (id) on delete cascade,
  kind public.notification_kind not null,
  task_id uuid references public.tasks (id) on delete cascade,
  actor_id uuid references public.team_members (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.notifications is 'In-app notifications. Written by triggers only.';

alter table public.activity_log
  add column task_id uuid references public.tasks (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index tasks_assignee_status_idx on public.tasks (assignee_id, status);
create index tasks_open_due_idx on public.tasks (due_on) where status <> 'done';
create index tasks_created_by_idx on public.tasks (created_by);
create index task_clients_client_id_idx on public.task_clients (client_id);
create index task_clients_done_by_idx on public.task_clients (done_by);
create index task_comments_task_id_idx on public.task_comments (task_id, created_at);
create index task_comments_author_id_idx on public.task_comments (author_id);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_task_id_idx on public.notifications (task_id);
create index notifications_actor_id_idx on public.notifications (actor_id);
create index activity_log_task_id_idx on public.activity_log (task_id);

-- ---------------------------------------------------------------------------
-- Helpers (private: not callable through the API)
-- ---------------------------------------------------------------------------
create or replace function private.agency_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Phoenix')::date
$$;

-- Admins, managers and read-only can see every task; VAs and writers their own.
create or replace function private.can_see_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('{admin,manager,viewer}')
    or (
      private.has_role('{va,writer}')
      and exists (
        select 1 from public.tasks t
        where t.id = p_task_id and t.assignee_id = (select auth.uid())
      )
    )
$$;

-- Who may tick clients off, change status and comment.
create or replace function private.can_work_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('{admin,manager}')
    or (
      private.has_role('{va,writer}')
      and exists (
        select 1 from public.tasks t
        where t.id = p_task_id and t.assignee_id = (select auth.uid())
      )
    )
$$;

-- Admins, managers and read-only see every client; VAs and writers only the
-- clients in tasks assigned to them.
create or replace function private.can_see_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('{admin,manager,viewer}')
    or (
      private.has_role('{va,writer}')
      and exists (
        select 1
        from public.task_clients tc
        join public.tasks t on t.id = tc.task_id
        where tc.client_id = p_client_id and t.assignee_id = (select auth.uid())
      )
    )
$$;

-- Next due date for a repeating task, never in the past.
create or replace function private.next_due_on(p_from date, p_repeat public.task_repeat)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  today date := private.agency_today();
  next_date date := coalesce(p_from, today);
  guard integer := 0;
begin
  loop
    next_date := case p_repeat
      when 'weekly' then next_date + 7
      when 'monthly' then (next_date + interval '1 month')::date
      else case extract(isodow from next_date)
        when 5 then next_date + 3
        when 6 then next_date + 2
        else next_date + 1
      end
    end;
    guard := guard + 1;
    exit when next_date >= today or guard > 400;
  end loop;
  return next_date;
end;
$$;

create or replace function private.log_task_activity(
  p_task_id uuid,
  p_action text,
  p_meta jsonb,
  p_client_id uuid default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_log (actor_id, task_id, client_id, action, meta)
  values ((select auth.uid()), p_task_id, p_client_id, p_action, p_meta)
$$;

create or replace function private.notify(
  p_recipient uuid,
  p_kind public.notification_kind,
  p_task_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (recipient_id, kind, task_id, actor_id)
  select p_recipient, p_kind, p_task_id, (select auth.uid())
  where p_recipient is not null
    and p_recipient is distinct from (select auth.uid())
    and exists (
      select 1 from public.team_members m where m.id = p_recipient and m.status = 'active'
    )
$$;

-- ---------------------------------------------------------------------------
-- Triggers: tasks
-- ---------------------------------------------------------------------------
-- Before update: VAs/writers may only change status; keep timestamps right.
create or replace function private.tasks_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not private.has_role('{admin,manager}') then
    if (new.title, new.description, new.steps, new.type, new.priority, new.assignee_id,
        new.due_on, new.repeat, new.previous_task_id, new.created_by, new.number)
       is distinct from
       (old.title, old.description, old.steps, old.type, old.priority, old.assignee_id,
        old.due_on, old.repeat, old.previous_task_id, old.created_by, old.number) then
      raise exception 'Only an account manager can change this task.' using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  if new.status = 'done' and old.status <> 'done' then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create or replace function private.tasks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.log_task_activity(
    new.id,
    case when new.previous_task_id is null then 'task.created' else 'task.repeated' end,
    jsonb_build_object('number', new.number, 'title', new.title)
  );
  perform private.notify(new.assignee_id, 'task_assigned', new.id);
  return null;
end;
$$;

create or replace function private.tasks_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_id uuid;
  assignee_name text;
begin
  if new.status is distinct from old.status then
    perform private.log_task_activity(
      new.id, 'task.status_changed',
      jsonb_build_object('number', new.number, 'from', old.status, 'to', new.status)
    );
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    select coalesce(nullif(m.full_name, ''), split_part(m.email, '@', 1))
      into assignee_name
      from public.team_members m where m.id = new.assignee_id;
    perform private.log_task_activity(
      new.id, 'task.assigned',
      jsonb_build_object('number', new.number, 'assignee_name', assignee_name)
    );
    perform private.notify(new.assignee_id, 'task_assigned', new.id);
  end if;

  if new.due_on is distinct from old.due_on then
    perform private.log_task_activity(
      new.id, 'task.due_changed',
      jsonb_build_object('number', new.number, 'from', old.due_on, 'to', new.due_on)
    );
  end if;

  -- A repeating task that just got done creates its next copy (once).
  if new.status = 'done' and old.status <> 'done' and new.repeat <> 'none'
     and not exists (select 1 from public.tasks n where n.previous_task_id = new.id) then
    insert into public.tasks (
      title, description, steps, type, priority, assignee_id, due_on, repeat,
      previous_task_id, created_by
    )
    values (
      new.title, new.description, new.steps, new.type, new.priority, new.assignee_id,
      private.next_due_on(new.due_on, new.repeat), new.repeat, new.id, new.created_by
    )
    returning id into next_id;

    insert into public.task_clients (task_id, client_id)
    select next_id, tc.client_id from public.task_clients tc where tc.task_id = new.id;
  end if;

  return null;
end;
$$;

create trigger tasks_before_update
  before update on public.tasks
  for each row execute function private.tasks_before_update();

create trigger tasks_after_insert
  after insert on public.tasks
  for each row execute function private.tasks_after_insert();

create trigger tasks_after_update
  after update on public.tasks
  for each row execute function private.tasks_after_update();

-- ---------------------------------------------------------------------------
-- Triggers: task_clients
-- ---------------------------------------------------------------------------
-- VAs/writers may only tick/untick; done_by is always the person ticking.
create or replace function private.task_clients_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.task_id is distinct from old.task_id or new.client_id is distinct from old.client_id then
    raise exception 'Move a client by removing and adding it instead.' using errcode = '42501';
  end if;
  if new.done_at is null then
    new.done_by := null;
  elsif old.done_at is null then
    new.done_by := coalesce((select auth.uid()), new.done_by);
  else
    new.done_at := old.done_at;
    new.done_by := old.done_by;
  end if;
  return new;
end;
$$;

-- Keep the task's status in step with the ticks.
create or replace function private.task_clients_sync_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tid uuid := coalesce(new.task_id, old.task_id);
  current_status public.task_status;
  total integer;
  done integer;
  task_number bigint;
begin
  select status, number into current_status, task_number from public.tasks where id = tid;
  if not found then
    return null; -- the task itself is being deleted
  end if;

  if tg_op = 'UPDATE' and new.done_at is distinct from old.done_at then
    perform private.log_task_activity(
      tid,
      case when new.done_at is null then 'task.client_undone' else 'task.client_done' end,
      jsonb_build_object('number', task_number),
      new.client_id
    );
  end if;

  select count(*), count(done_at) into total, done from public.task_clients where task_id = tid;

  if total > 0 and done = total and current_status <> 'done' then
    update public.tasks set status = 'done' where id = tid;
  elsif done < total and current_status = 'done' then
    update public.tasks set status = 'in_progress' where id = tid;
  elsif done > 0 and current_status = 'todo' then
    update public.tasks set status = 'in_progress' where id = tid;
  end if;
  return null;
end;
$$;

create trigger task_clients_before_update
  before update on public.task_clients
  for each row execute function private.task_clients_before_update();

create trigger task_clients_sync_status
  after insert or update or delete on public.task_clients
  for each row execute function private.task_clients_sync_status();

-- ---------------------------------------------------------------------------
-- Triggers: comments
-- ---------------------------------------------------------------------------
create or replace function private.task_comments_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  recipient uuid;
begin
  select id, number, assignee_id into t from public.tasks where id = new.task_id;

  perform private.log_task_activity(
    t.id, 'task.commented', jsonb_build_object('number', t.number)
  );

  -- Mentioned people who can see the task (managers, or the assignee).
  for recipient in
    select distinct m.id
    from unnest(new.mentions) as mention(id)
    join public.team_members m on m.id = mention.id
    where m.status = 'active'
      and (m.role in ('admin', 'manager', 'viewer') or m.id = t.assignee_id)
  loop
    perform private.notify(recipient, 'task_mentioned', t.id);
  end loop;

  -- The assignee hears about new comments unless they were just mentioned.
  if t.assignee_id is not null and not (t.assignee_id = any (new.mentions)) then
    perform private.notify(t.assignee_id, 'task_commented', t.id);
  end if;
  return null;
end;
$$;

create trigger task_comments_after_insert
  after insert on public.task_comments
  for each row execute function private.task_comments_after_insert();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.tasks enable row level security;
alter table public.task_clients enable row level security;
alter table public.task_comments enable row level security;
alter table public.notifications enable row level security;

create policy "See tasks you are allowed to see"
  on public.tasks for select to authenticated
  using (
    (select private.has_role('{admin,manager,viewer}'))
    or (assignee_id = (select auth.uid()) and (select private.has_role('{va,writer}')))
  );

create policy "Admins and managers create tasks"
  on public.tasks for insert to authenticated
  with check ((select private.has_role('{admin,manager}')));

create policy "Managers edit tasks, assignees update their own"
  on public.tasks for update to authenticated
  using (
    (select private.has_role('{admin,manager}'))
    or (assignee_id = (select auth.uid()) and (select private.has_role('{va,writer}')))
  )
  with check (
    (select private.has_role('{admin,manager}'))
    or (assignee_id = (select auth.uid()) and (select private.has_role('{va,writer}')))
  );

create policy "Admins and managers delete tasks"
  on public.tasks for delete to authenticated
  using ((select private.has_role('{admin,manager}')));

create policy "See the clients of tasks you can see"
  on public.task_clients for select to authenticated
  using (private.can_see_task(task_id));

create policy "Admins and managers add clients to tasks"
  on public.task_clients for insert to authenticated
  with check ((select private.has_role('{admin,manager}')));

create policy "People working the task tick clients off"
  on public.task_clients for update to authenticated
  using (private.can_work_task(task_id))
  with check (private.can_work_task(task_id));

create policy "Admins and managers remove clients from tasks"
  on public.task_clients for delete to authenticated
  using ((select private.has_role('{admin,manager}')));

create policy "See comments on tasks you can see"
  on public.task_comments for select to authenticated
  using (private.can_see_task(task_id));

create policy "People working the task comment"
  on public.task_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and private.can_work_task(task_id));

create policy "Authors and admins delete comments"
  on public.task_comments for delete to authenticated
  using (author_id = (select auth.uid()) or (select private.has_role('{admin}')));

create policy "See your own notifications"
  on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

create policy "Mark your own notifications read"
  on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create policy "Delete your own notifications"
  on public.notifications for delete to authenticated
  using (recipient_id = (select auth.uid()));

-- VAs and writers now only see the clients (and alerts) in their tasks.
drop policy "Team members can view clients" on public.clients;
create policy "See clients you are allowed to see"
  on public.clients for select to authenticated
  using (private.can_see_client(id));

drop policy "Team members can view alerts" on public.alerts;
create policy "See alerts for clients you can see"
  on public.alerts for select to authenticated
  using (private.can_see_client(client_id));

-- ---------------------------------------------------------------------------
-- Read models for the Tasks page
-- ---------------------------------------------------------------------------
create view public.task_list
with (security_invoker = true)
as
select
  t.id,
  t.number,
  t.title,
  t.type,
  t.status,
  t.priority,
  t.assignee_id,
  coalesce(nullif(a.full_name, ''), split_part(a.email, '@', 1)) as assignee_name,
  t.due_on,
  t.repeat,
  t.completed_at,
  t.created_at,
  t.updated_at,
  coalesce(c.total, 0) as clients_total,
  coalesce(c.done, 0) as clients_done,
  coalesce(c.preview, '{}') as client_preview,
  coalesce(c.search, '') as client_search
from public.tasks t
left join public.team_members a on a.id = t.assignee_id
left join lateral (
  select
    count(*)::integer as total,
    count(tc.done_at)::integer as done,
    (array_agg(cl.name order by cl.name))[1:2] as preview,
    string_agg(cl.name, ' ') as search
  from public.task_clients tc
  join public.clients cl on cl.id = tc.client_id
  where tc.task_id = t.id
) c on true;

comment on view public.task_list is 'Tasks with assignee name and client progress. RLS of the base tables applies.';

-- Counts for the tiles, tabs and the sidebar badge (caller's RLS applies).
create or replace function public.task_counts(p_mine boolean default false)
returns table (
  mine_open integer,
  team_open integer,
  waiting integer,
  done integer,
  overdue integer,
  due_today integer,
  due_this_week integer,
  my_attention integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with d as (
    select
      private.agency_today() as today,
      private.agency_today() + (7 - extract(isodow from private.agency_today())::integer) as week_end,
      (select auth.uid()) as me
  )
  select
    count(*) filter (where t.status <> 'done' and t.assignee_id = d.me)::integer,
    count(*) filter (where t.status <> 'done')::integer,
    count(*) filter (where t.status = 'waiting_on_client' and (not p_mine or t.assignee_id = d.me))::integer,
    count(*) filter (where t.status = 'done' and (not p_mine or t.assignee_id = d.me))::integer,
    count(*) filter (where t.status <> 'done' and t.due_on < d.today and (not p_mine or t.assignee_id = d.me))::integer,
    count(*) filter (where t.status <> 'done' and t.due_on = d.today and (not p_mine or t.assignee_id = d.me))::integer,
    count(*) filter (where t.status <> 'done' and t.due_on > d.today and t.due_on <= d.week_end and (not p_mine or t.assignee_id = d.me))::integer,
    count(*) filter (where t.status <> 'done' and t.assignee_id = d.me and t.due_on <= d.today)::integer
  from d
  left join public.tasks t on true
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema private from public, anon;
grant execute on function private.agency_today() to authenticated;
grant execute on function private.can_see_task(uuid) to authenticated;
grant execute on function private.can_work_task(uuid) to authenticated;
grant execute on function private.can_see_client(uuid) to authenticated;
grant execute on function private.is_team_member() to authenticated;
grant execute on function private.has_role(public.app_role[]) to authenticated;
grant execute on function private.current_app_role() to authenticated;
revoke execute on function public.task_counts(boolean) from public, anon;
grant execute on function public.task_counts(boolean) to authenticated;
revoke all on public.task_list from anon;
