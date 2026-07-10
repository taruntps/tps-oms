-- Migration 070: repoint cancel_requests user FKs from auth.users to profiles
-- so PostgREST can embed the requester's name (profiles!... join was failing
-- with PGRST200, which made the Approvals Inbox render empty).

alter table cancel_requests drop constraint cancel_requests_requested_by_fkey;
alter table cancel_requests add constraint cancel_requests_requested_by_fkey
  foreign key (requested_by) references profiles(id);

alter table cancel_requests drop constraint cancel_requests_approved_by_fkey;
alter table cancel_requests add constraint cancel_requests_approved_by_fkey
  foreign key (approved_by) references profiles(id);

notify pgrst, 'reload schema';
