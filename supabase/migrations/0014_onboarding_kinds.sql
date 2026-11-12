-- 0014_onboarding_kinds: notifications for the client onboarding link.
-- Kept separate because a new enum value can't be used in the same transaction.
alter type public.notification_kind add value if not exists 'onboarding_opened';
alter type public.notification_kind add value if not exists 'onboarding_submitted';
