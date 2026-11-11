-- 0008_client_requests: things we need FROM the client (codes, files, approvals,
-- answers, actions). Clients respond through a private link (/c/<token>); the
-- token is checked inside the portal_* functions below, so the portal needs no
-- sign-in and no server secret. Linked tasks move to "Waiting on client" and
-- back automatically.

-- ---------------------------------------------------------------------------
-- Types and tables
-- ---------------------------------------------------------------------------
create type public.request_kind as enum ('question', 'code', 'files', 'approval', 'action');
create type public.request_status as enum ('open', 'answered', 'done', 'cancelled');
create type public.request_decision as enum ('approved', 'changes_requested');

create table public.client_portal_links (
  client_id uuid primary key references public.clients (id) on delete cascade,
  token text not null unique check (char_length(token) >= 32),
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  last_opened_at timestamptz
);
comment on table public.client_portal_links is 'One private portal link per client. A new token turns the old link off.';

create table public.client_requests (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 101) unique,
  client_id uuid not null references public.clients (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  kind public.request_kind not null,
  status public.request_status not null default 'open',
  title text not null check (char_length(title) between 3 and 160),
  instructions text check (instructions is null or char_length(instructions) <= 4000),
  internal_note text check (internal_note is null or char_length(internal_note) <= 2000),
  options jsonb not null default '{}'::jsonb,
  auto_complete boolean not null default false,
  due_on date,
  owner_id uuid references public.team_members (id) on delete set null,
  created_by uuid references public.team_members (id) on delete set null,
  response_text text check (response_text is null or char_length(response_text) <= 4000),
  decision public.request_decision,
  responded_at timestamptz,
  responder_name text check (responder_name is null or char_length(responder_name) <= 80),
  ask_again_note text check (ask_again_note is null or char_length(ask_again_note) <= 1000),
  reopen_count integer not null default 0,
  completed_at timestamptz,
  completed_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.client_requests is 'Things we need from a client. Answered through their portal link.';

create table public.client_request_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.client_requests (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

alter table public.notifications
  add column request_id uuid references public.client_requests (id) on delete cascade;
alter table public.activity_log
  add column request_id uuid references public.client_requests (id) on delete set null;

create index client_requests_client_idx on public.client_requests (client_id, status);
create index client_requests_task_idx on public.client_requests (task_id) where task_id is not null;
create index client_requests_owner_idx on public.client_requests (owner_id);
create index client_requests_created_by_idx on public.client_requests (created_by);
create index client_requests_completed_by_idx on public.client_requests (completed_by);
create index client_requests_open_due_idx on public.client_requests (due_on) where status = 'open';
create index client_request_files_request_idx on public.client_request_files (request_id);
create index client_request_files_client_idx on public.client_request_files (client_id);
create index client_portal_links_created_by_idx on public.client_portal_links (created_by);
create index notifications_request_id_idx on public.notifications (request_id);
create index activity_log_request_id_idx on public.activity_log (request_id);

-- ---------------------------------------------------------------------------
-- Storage: private bucket for client uploads (10 MB, images and PDF)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-uploads', 'client-uploads', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.request_max_files(p_options jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select least(greatest(coalesce((p_options ->> 'max_files')::integer, 20), 1), 20)
$$;

-- Uploads go to "<request_id>/<uuid>-<name>"; allowed while that request is an
-- open "files" request with room for more files.
create or replace function private.portal_can_upload(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rid uuid;
  req record;
  existing integer;
begin
  if split_part(p_object_name, '/', 1) !~ '^[0-9a-f-]{36}$' then
    return false;
  end if;
  rid := split_part(p_object_name, '/', 1)::uuid;
  select id, kind, status, options into req from public.client_requests where id = rid;
  if not found or req.kind <> 'files' or req.status <> 'open' then
    return false;
  end if;
  select count(*) into existing from public.client_request_files where request_id = rid;
  return existing < private.request_max_files(req.options);
end;
$$;

create or replace function private.can_see_request_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_request_files f
    where f.storage_path = p_object_name and private.can_see_client(f.client_id)
  )
$$;

create or replace function private.log_request_activity(
  p_request_id uuid,
  p_client_id uuid,
  p_task_id uuid,
  p_action text,
  p_meta jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_log (actor_id, client_id, task_id, request_id, action, meta)
  values ((select auth.uid()), p_client_id, p_task_id, p_request_id, p_action, p_meta)
$$;

create or replace function private.notify_request(p_recipient uuid, p_request_id uuid, p_task_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (recipient_id, kind, task_id, request_id, actor_id)
  select p_recipient, 'request_answered', p_task_id, p_request_id, (select auth.uid())
  where p_recipient is not null
    and p_recipient is distinct from (select auth.uid())
    and exists (select 1 from public.team_members m where m.id = p_recipient and m.status = 'active')
$$;

-- A task is "Waiting on client" while it has open requests, and goes back to
-- "In progress" when the last one is answered or cancelled.
create or replace function private.sync_task_with_requests(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  open_count integer;
  task_status public.task_status;
begin
  if p_task_id is null then
    return;
  end if;
  select status into task_status from public.tasks where id = p_task_id;
  if not found then
    return;
  end if;
  select count(*) into open_count
  from public.client_requests where task_id = p_task_id and status = 'open';

  if open_count > 0 and task_status in ('todo', 'in_progress') then
    update public.tasks set status = 'waiting_on_client' where id = p_task_id;
  elsif open_count = 0 and task_status = 'waiting_on_client' then
    update public.tasks set status = 'in_progress' where id = p_task_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function private.client_requests_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.status := 'open';
    return new;
  end if;

  if new.status = 'answered' and old.status <> 'answered' then
    new.responded_at := coalesce(new.responded_at, now());
    if new.auto_complete then
      new.status := 'done';
    end if;
  end if;

  if new.status = 'done' and old.status <> 'done' then
    new.completed_at := now();
    new.completed_by := (select auth.uid());
  elsif new.status <> 'done' then
    new.completed_at := null;
    new.completed_by := null;
  end if;

  if new.status = 'open' and old.status in ('answered', 'done') then
    new.reopen_count := old.reopen_count + 1;
  end if;
  return new;
end;
$$;

create or replace function private.client_requests_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_assignee uuid;
  meta jsonb := jsonb_build_object('number', new.number, 'title', new.title);
begin
  if tg_op = 'INSERT' then
    perform private.log_request_activity(new.id, new.client_id, new.task_id, 'request.created', meta);
    perform private.sync_task_with_requests(new.task_id);
    return null;
  end if;

  if new.task_id is distinct from old.task_id then
    perform private.sync_task_with_requests(old.task_id);
  end if;

  if new.status is distinct from old.status then
    perform private.log_request_activity(
      new.id, new.client_id, new.task_id,
      case
        when old.status = 'open' and new.status in ('answered', 'done') and new.responded_at is not null
          and new.responded_at is distinct from old.responded_at then 'request.answered'
        when new.status = 'done' then 'request.done'
        when new.status = 'open' then 'request.reopened'
        when new.status = 'cancelled' then 'request.cancelled'
        else 'request.updated'
      end,
      meta
    );

    -- The client just answered: tell the owner and the task's assignee.
    if old.status = 'open' and new.status in ('answered', 'done')
       and new.responded_at is distinct from old.responded_at then
      perform private.notify_request(new.owner_id, new.id, new.task_id);
      if new.task_id is not null then
        select assignee_id into task_assignee from public.tasks where id = new.task_id;
        if task_assignee is distinct from new.owner_id then
          perform private.notify_request(task_assignee, new.id, new.task_id);
        end if;
      end if;
    end if;
  end if;

  perform private.sync_task_with_requests(new.task_id);
  return null;
end;
$$;

create trigger client_requests_before_write
  before insert or update on public.client_requests
  for each row execute function private.client_requests_before_write();

create trigger client_requests_after_write
  after insert or update on public.client_requests
  for each row execute function private.client_requests_after_write();

-- ---------------------------------------------------------------------------
-- Row level security (team side)
-- ---------------------------------------------------------------------------
alter table public.client_portal_links enable row level security;
alter table public.client_requests enable row level security;
alter table public.client_request_files enable row level security;

create policy "Team sees portal links for clients they work on"
  on public.client_portal_links for select to authenticated
  using ((select private.has_role('{admin,manager,va,writer}')) and private.can_see_client(client_id));

create policy "Admins and managers create portal links"
  on public.client_portal_links for insert to authenticated
  with check ((select private.has_role('{admin,manager}')));

create policy "Admins and managers replace portal links"
  on public.client_portal_links for update to authenticated
  using ((select private.has_role('{admin,manager}')))
  with check ((select private.has_role('{admin,manager}')));

create policy "Admins and managers delete portal links"
  on public.client_portal_links for delete to authenticated
  using ((select private.has_role('{admin,manager}')));

create policy "See requests for clients you can see"
  on public.client_requests for select to authenticated
  using (private.can_see_client(client_id));

create policy "Team creates requests for clients they work on"
  on public.client_requests for insert to authenticated
  with check (
    (select private.has_role('{admin,manager,va,writer}'))
    and private.can_see_client(client_id)
    and created_by = (select auth.uid())
  );

create policy "Managers, owners and task assignees update requests"
  on public.client_requests for update to authenticated
  using (
    (select private.has_role('{admin,manager}'))
    or owner_id = (select auth.uid())
    or created_by = (select auth.uid())
    or exists (
      select 1 from public.tasks t
      where t.id = client_requests.task_id and t.assignee_id = (select auth.uid())
    )
  )
  with check (private.can_see_client(client_id));

create policy "Admins and managers delete requests"
  on public.client_requests for delete to authenticated
  using ((select private.has_role('{admin,manager}')));

create policy "See files for clients you can see"
  on public.client_request_files for select to authenticated
  using (private.can_see_client(client_id));

create policy "Admins and managers delete files"
  on public.client_request_files for delete to authenticated
  using ((select private.has_role('{admin,manager}')));

-- Storage: the portal (anon) uploads into open "files" requests; the team reads.
create policy "Portal uploads into open file requests"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'client-uploads' and private.portal_can_upload(name));

create policy "Team reads client uploads"
  on storage.objects for select to authenticated
  using (bucket_id = 'client-uploads' and private.can_see_request_object(name));

-- ---------------------------------------------------------------------------
-- Portal functions (anon + authenticated). Every one checks the token first.
-- ---------------------------------------------------------------------------
create or replace function private.portal_client(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select client_id from public.client_portal_links
  where p_token is not null and char_length(p_token) >= 32 and token = p_token
$$;

create or replace function public.portal_get(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cid uuid := private.portal_client(p_token);
  result jsonb;
begin
  if cid is null then
    return null;
  end if;

  update public.client_portal_links
    set last_opened_at = now()
    where client_id = cid and (last_opened_at is null or last_opened_at < now() - interval '10 minutes');

  select jsonb_build_object(
    'client', jsonb_build_object('name', c.name),
    'contact', nullif(split_part(coalesce(nullif(o.full_name, ''), split_part(o.email, '@', 1)), ' ', 1), ''),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', r.id,
          'number', r.number,
          'kind', r.kind,
          'status', r.status,
          'title', r.title,
          'instructions', r.instructions,
          'options', r.options,
          'due_on', r.due_on,
          'ask_again_note', case when r.status = 'open' then r.ask_again_note end,
          'decision', r.decision,
          'responded_at', r.responded_at,
          'responder_name', r.responder_name,
          'files', coalesce((
            select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.file_name, 'size', f.size_bytes) order by f.created_at)
            from public.client_request_files f where f.request_id = r.id
          ), '[]'::jsonb)
        ) order by
          case r.status when 'open' then 0 when 'answered' then 1 else 2 end,
          r.due_on nulls last, r.number)
      from public.client_requests r
      where r.client_id = cid
        and (r.status in ('open', 'answered') or (r.status = 'done' and r.completed_at > now() - interval '60 days'))
    ), '[]'::jsonb)
  )
  into result
  from public.clients c
  left join public.team_members o on o.id = c.owner_id
  where c.id = cid;

  return result;
end;
$$;

create or replace function public.portal_attach_file(
  p_token text,
  p_request_id uuid,
  p_path text,
  p_name text,
  p_mime text,
  p_size bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := private.portal_client(p_token);
  req record;
  existing integer;
  file_id uuid;
begin
  if cid is null then
    raise exception 'This link isn''t active.' using errcode = '42501';
  end if;
  select id, client_id, kind, status, options into req from public.client_requests where id = p_request_id;
  if not found or req.client_id <> cid then
    raise exception 'This request isn''t available.' using errcode = '42501';
  end if;
  if req.kind <> 'files' or req.status <> 'open' then
    raise exception 'This request is no longer taking files.' using errcode = 'P0001';
  end if;
  if p_path not like p_request_id::text || '/%' then
    raise exception 'That upload doesn''t belong to this request.' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'client-uploads' and o.name = p_path) then
    raise exception 'The upload didn''t finish. Try again.' using errcode = 'P0001';
  end if;
  select count(*) into existing from public.client_request_files where request_id = p_request_id;
  if existing >= private.request_max_files(req.options) then
    raise exception 'That''s the most files this request takes.' using errcode = 'P0001';
  end if;

  insert into public.client_request_files (request_id, client_id, storage_path, file_name, mime_type, size_bytes)
  values (p_request_id, cid, p_path, left(coalesce(nullif(p_name, ''), 'file'), 200), left(p_mime, 100), p_size)
  on conflict (storage_path) do update set file_name = excluded.file_name
  returning id into file_id;
  return file_id;
end;
$$;

create or replace function public.portal_remove_file(p_token text, p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := private.portal_client(p_token);
begin
  if cid is null then
    raise exception 'This link isn''t active.' using errcode = '42501';
  end if;
  delete from public.client_request_files f
  using public.client_requests r
  where f.id = p_file_id and r.id = f.request_id and f.client_id = cid and r.status = 'open';
end;
$$;

create or replace function public.portal_respond(
  p_token text,
  p_request_id uuid,
  p_text text,
  p_decision public.request_decision,
  p_name text
)
returns public.request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := private.portal_client(p_token);
  req record;
  answer text := nullif(btrim(coalesce(p_text, '')), '');
  file_count integer;
  new_status public.request_status;
begin
  if cid is null then
    raise exception 'This link isn''t active.' using errcode = '42501';
  end if;
  select id, client_id, kind, status, options into req
  from public.client_requests where id = p_request_id for update;
  if not found or req.client_id <> cid then
    raise exception 'This request isn''t available.' using errcode = '42501';
  end if;
  if req.status = 'cancelled' then
    raise exception 'This request is no longer needed.' using errcode = 'P0001';
  end if;
  if req.status <> 'open' then
    raise exception 'Already answered, thanks.' using errcode = 'P0001';
  end if;

  if req.kind in ('question', 'code') and answer is null then
    raise exception 'Type your answer first.' using errcode = 'P0001';
  end if;
  if req.kind = 'code' and char_length(answer) > 64 then
    raise exception 'That code looks too long.' using errcode = 'P0001';
  end if;
  if req.kind = 'approval' and p_decision is null then
    raise exception 'Choose approve or ask for changes.' using errcode = 'P0001';
  end if;
  if req.kind = 'approval' and p_decision = 'changes_requested' and answer is null then
    raise exception 'Tell us what to change.' using errcode = 'P0001';
  end if;
  if req.kind = 'files' then
    select count(*) into file_count from public.client_request_files where request_id = req.id;
    if file_count < greatest(coalesce((req.options ->> 'min_files')::integer, 1), 1) then
      raise exception 'Add the files first.' using errcode = 'P0001';
    end if;
  end if;

  update public.client_requests
    set status = 'answered',
        response_text = left(answer, 4000),
        decision = case when req.kind = 'approval' then p_decision end,
        responded_at = now(),
        responder_name = left(nullif(btrim(coalesce(p_name, '')), ''), 80),
        ask_again_note = null
    where id = req.id
    returning status into new_status;
  return new_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema private from public, anon;
grant execute on function private.portal_can_upload(text) to anon, authenticated;
grant execute on function private.can_see_request_object(text) to authenticated;
grant execute on function private.can_see_client(uuid) to authenticated;
grant execute on function private.has_role(public.app_role[]) to authenticated;
grant execute on function private.is_team_member() to authenticated;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.can_see_task(uuid) to authenticated;
grant execute on function private.can_work_task(uuid) to authenticated;
grant execute on function private.agency_today() to authenticated;
grant usage on schema private to anon;

revoke execute on function public.portal_get(text) from public;
revoke execute on function public.portal_attach_file(text, uuid, text, text, text, bigint) from public;
revoke execute on function public.portal_remove_file(text, uuid) from public;
revoke execute on function public.portal_respond(text, uuid, text, public.request_decision, text) from public;
grant execute on function public.portal_get(text) to anon, authenticated;
grant execute on function public.portal_attach_file(text, uuid, text, text, text, bigint) to anon, authenticated;
grant execute on function public.portal_remove_file(text, uuid) to anon, authenticated;
grant execute on function public.portal_respond(text, uuid, text, public.request_decision, text) to anon, authenticated;
