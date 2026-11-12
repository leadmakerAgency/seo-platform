-- 0013_social_accounts_client_fk: a direct link from an account to its client,
-- next to the composite one through zernio_profiles, so queries can embed the
-- client (notifications, "also connected to" warnings).
alter table public.social_accounts
  add constraint social_accounts_client_id_fkey
  foreign key (client_id) references public.clients (id) on delete cascade;
