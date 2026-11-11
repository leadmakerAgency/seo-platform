-- 0007_request_notification_kind: new notification kind for client requests.
-- Kept separate because a new enum value can't be used in the same transaction.
alter type public.notification_kind add value if not exists 'request_answered';
