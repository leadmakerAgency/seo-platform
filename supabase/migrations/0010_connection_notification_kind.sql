-- 0010_connection_notification_kind: notification when a client's connected
-- account (Google Business Profile, Facebook...) stops working.
-- Kept separate because a new enum value can't be used in the same transaction.
alter type public.notification_kind add value if not exists 'connection_lost';
