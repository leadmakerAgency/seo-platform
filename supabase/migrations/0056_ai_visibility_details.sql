-- 0056 · AI Visibility detail reads (docs/plans/ai-visibility/06-ui.md): the question panel, the
-- source panel, brand insights, and a cost split for the shared "Runs and costs" panel.
-- All security invoker (RLS applies), except aiv_run_history (definer, checks the client).

-- Latest answer per platform for one question.
create or replace function public.aiv_prompt_detail(p_prompt_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with latest as (
    select distinct on (c.model) c.*
    from public.aiv_chats c
    where c.prompt_id = p_prompt_id
    order by c.model, c.run_date desc, c.created_at desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'chat_id', l.id, 'model', l.model, 'run_date', l.run_date, 'status', l.status, 'error', l.error,
    'own_mentioned', exists (select 1 from public.aiv_mentions m join public.aiv_brands b on b.id = m.brand_id and b.is_own where m.chat_id = l.id),
    'own_position', (select m.position from public.aiv_mentions m join public.aiv_brands b on b.id = m.brand_id and b.is_own where m.chat_id = l.id limit 1),
    'mentions', (select coalesce(jsonb_agg(jsonb_build_object('name', m.name, 'position', m.position, 'brand_id', m.brand_id) order by m.position), '[]')
                 from (select * from public.aiv_mentions mm where mm.chat_id = l.id order by mm.position limit 6) m),
    'sources', (select count(*) from public.aiv_sources s where s.chat_id = l.id)
  ) order by l.model), '[]'::jsonb)
  from latest l
$$;

-- One site: which questions and platforms used it, its pages, and how often over time.
create or replace function public.aiv_source_detail(p_client_id uuid, f jsonb, p_domain text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (select * from private.aiv_scope(p_client_id, f)),
  src as (
    select so.*, s.prompt_id from public.aiv_sources so join s on s.chat_id = so.chat_id
    where so.domain = lower(p_domain)
  )
  select jsonb_build_object(
    'domain', lower(p_domain),
    'type', coalesce((select d.type from public.aiv_domains d where d.domain = lower(p_domain)), 'other'),
    'answers', (select count(distinct chat_id) from src),
    'cited', (select count(distinct chat_id) from src where cited),
    'prompts', coalesce((
      select jsonb_agg(jsonb_build_object('prompt_id', x.prompt_id, 'text', q.text, 'models', x.models, 'answers', x.n, 'cited', x.c, 'last_date', x.last)
        order by x.n desc)
      from (select prompt_id, array_agg(distinct model::text) models, count(distinct chat_id) n,
                   count(distinct chat_id) filter (where cited) c, max(run_date) last
            from src group by prompt_id order by count(distinct chat_id) desc limit 30) x
      join public.aiv_prompts q on q.id = x.prompt_id
    ), '[]'::jsonb),
    'urls', coalesce((
      select jsonb_agg(jsonb_build_object('url', u.url, 'title', u.title, 'answers', u.n, 'cited', u.c) order by u.n desc)
      from (select url, max(title) title, count(distinct chat_id) n, count(distinct chat_id) filter (where cited) c
            from src group by url order by count(distinct chat_id) desc limit 20) u
    ), '[]'::jsonb),
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object('week', w.wk, 'answers', w.n) order by w.wk)
      from (select date_trunc('week', run_date::timestamp)::date wk, count(distinct chat_id) n from src group by 1) w
    ), '[]'::jsonb)
  )
$$;

-- One brand: its trend with how often its own sites were read, and the questions it wins and loses.
create or replace function public.aiv_brand_insight(p_client_id uuid, f jsonb, p_brand_id uuid, p_bucket text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with b as (select * from public.aiv_brands where id = p_brand_id and client_id = p_client_id),
  s as (
    select sc.*, date_trunc(case when p_bucket in ('week', 'month') then p_bucket else 'day' end, sc.run_date::timestamp)::date as bk
    from private.aiv_scope(p_client_id, f) sc
  ),
  hit as (select m.chat_id, m.position, m.sentiment from public.aiv_mentions m join s on s.chat_id = m.chat_id where m.brand_id = p_brand_id),
  rd as (
    select distinct so.chat_id from public.aiv_sources so join s on s.chat_id = so.chat_id, b, unnest(b.domains) d
    where so.domain = d or so.domain like '%.' || d
  )
  select jsonb_build_object(
    'trend', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bucket', t.bk, 'answers', t.n, 'mentioned', t.hits, 'position', t.pos, 'sentiment', t.sent, 'read', t.reads
      ) order by t.bk)
      from (
        select s.bk, count(*)::integer n, count(h.chat_id)::integer hits, round(avg(h.position), 2) pos, round(avg(h.sentiment), 1) sent,
               count(r.chat_id)::integer reads
        from s left join hit h on h.chat_id = s.chat_id left join rd r on r.chat_id = s.chat_id
        group by s.bk
      ) t
    ), '[]'::jsonb),
    'prompts', coalesce((
      select jsonb_agg(jsonb_build_object('prompt_id', p.prompt_id, 'text', q.text, 'answers', p.n, 'mentioned', p.hits,
        'visibility', round(100.0 * p.hits / nullif(p.n, 0), 1), 'position', p.pos) order by p.hits * 1.0 / nullif(p.n, 0) desc, p.n desc)
      from (
        select s.prompt_id, count(*)::integer n, count(h.chat_id)::integer hits, round(avg(h.position), 2) pos
        from s left join hit h on h.chat_id = s.chat_id
        group by s.prompt_id
      ) p
      join public.aiv_prompts q on q.id = p.prompt_id
    ), '[]'::jsonb)
  )
$$;

-- Runs and costs: DataForSEO split into Google AI (SERP) and AI answers (AI Optimization).
create or replace function public.aiv_run_history(p_client_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_see_client(p_client_id) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'trigger', r.trigger, 'status', r.status, 'created_at', r.created_at, 'finished_at', r.finished_at,
      'counts', r.counts, 'error', r.error, 'estimate_usd', r.estimate_usd,
      'dfs_usd', coalesce((select sum(cost_usd) from public.dfs_calls dc where dc.ref = r.id), 0),
      'serp_usd', coalesce((select sum(cost_usd) from public.dfs_calls dc where dc.ref = r.id and dc.api = 'serp_google'), 0),
      'serp_calls', (select count(*) from public.dfs_calls dc where dc.ref = r.id and dc.api = 'serp_google'),
      'llm_usd', coalesce((select sum(cost_usd) from public.dfs_calls dc where dc.ref = r.id and dc.api = 'ai_optimization'), 0),
      'llm_calls', (select count(*) from public.dfs_calls dc where dc.ref = r.id and dc.api = 'ai_optimization'),
      'ai_usd', coalesce((select sum(cost_usd) from public.ai_calls ac where ac.ref = r.id), 0),
      'ai_calls', (select count(*) from public.ai_calls ac where ac.ref = r.id),
      'ai_in', (select sum(input_tokens) from public.ai_calls ac where ac.ref = r.id),
      'ai_out', (select sum(output_tokens) from public.ai_calls ac where ac.ref = r.id),
      'answers', (select count(*) from public.aiv_chats c where c.run_id = r.id and c.status = 'ok'),
      'created_by', (select tm.full_name from public.team_members tm where tm.id = r.created_by)
    ) order by r.created_at desc)
    from (select * from public.aiv_runs where client_id = p_client_id order by created_at desc limit p_limit) r
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.aiv_prompt_detail(uuid) from public, anon;
revoke execute on function public.aiv_source_detail(uuid, jsonb, text) from public, anon;
revoke execute on function public.aiv_brand_insight(uuid, jsonb, uuid, text) from public, anon;
revoke execute on function public.aiv_run_history(uuid, integer) from public, anon;
grant execute on function public.aiv_prompt_detail(uuid) to authenticated;
grant execute on function public.aiv_source_detail(uuid, jsonb, text) to authenticated;
grant execute on function public.aiv_brand_insight(uuid, jsonb, uuid, text) to authenticated;
grant execute on function public.aiv_run_history(uuid, integer) to authenticated;
