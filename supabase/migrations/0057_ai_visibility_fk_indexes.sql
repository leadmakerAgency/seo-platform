-- 0057 · Covering indexes for the AI Visibility foreign keys (performance advisor, unindexed_foreign_keys).

create index if not exists aiv_actions_created_by_idx on public.aiv_actions (created_by);
create index if not exists aiv_actions_created_run_idx on public.aiv_actions (created_run_id);
create index if not exists aiv_actions_done_by_idx on public.aiv_actions (done_by);
create index if not exists aiv_actions_opportunity_idx on public.aiv_actions (opportunity_id);
create index if not exists aiv_actions_work_item_idx on public.aiv_actions (work_item_id);
create index if not exists aiv_ads_chat_idx on public.aiv_ads (chat_id);
create index if not exists aiv_brands_created_by_idx on public.aiv_brands (created_by);
create index if not exists aiv_mentions_brand_fk_idx on public.aiv_mentions (brand_id);
create index if not exists aiv_projects_updated_by_idx on public.aiv_projects (updated_by);
create index if not exists aiv_prompts_created_by_idx on public.aiv_prompts (created_by);
create index if not exists aiv_prompts_topic_idx on public.aiv_prompts (topic_id);
create index if not exists aiv_runs_created_by_idx on public.aiv_runs (created_by);
create index if not exists aiv_suggestions_decided_by_idx on public.aiv_suggestions (decided_by);
create index if not exists aiv_tasks_client_idx on public.aiv_tasks (client_id);
create index if not exists aiv_tasks_prompt_idx on public.aiv_tasks (prompt_id);
