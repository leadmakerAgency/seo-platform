-- 0022_overview_fk_indexes: cover the composite foreign keys that tie each rank /
-- AI answer to its own client's check (performance advisor).
create index keyword_ranks_check_client_idx on public.keyword_ranks (check_id, client_id, engine);
create index ai_answers_check_client_idx on public.ai_answers (check_id, client_id);
