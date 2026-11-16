-- 0031_backlinks_kinds: enum values Backlinks needs on existing types. Kept apart so the
-- next migrations can use them (an enum value can't be used in the transaction that adds it).

alter type public.dfs_api add value if not exists 'backlinks';
alter type public.notification_kind add value if not exists 'backlinks_found';
alter type public.notification_kind add value if not exists 'backlinks_failed';
