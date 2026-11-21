-- 0052 · AI Visibility enum values (docs/plans/ai-visibility/03-data-model.md)
-- New enum values can't be used in the transaction that adds them, so they get their own migration.

alter type public.dfs_api add value if not exists 'ai_optimization';
alter type public.notification_kind add value if not exists 'ai_visibility_ready';
alter type public.notification_kind add value if not exists 'ai_visibility_failed';

create type public.aiv_model as enum ('chatgpt', 'gemini', 'ai_overview', 'ai_mode', 'claude', 'perplexity');
create type public.aiv_intent as enum ('informational', 'commercial', 'transactional', 'navigational');
