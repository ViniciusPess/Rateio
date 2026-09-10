create index audit_events_actor_user_idx
  on public.audit_events (actor_user_id);
create index audit_events_workspace_actor_participant_idx
  on public.audit_events (workspace_id, actor_participant_id);
create index charges_reviewed_by_idx
  on public.charges (reviewed_by);
create index charges_workspace_subscription_idx
  on public.charges (workspace_id, subscription_id);
create index notices_recorded_by_idx
  on public.notices (recorded_by);
create index participant_access_links_created_by_idx
  on public.participant_access_links (created_by);
create index participants_auth_user_idx
  on public.participants (auth_user_id);
create index payment_proofs_workspace_charge_participant_idx
  on public.payment_proofs (workspace_id, charge_id, participant_id);
create index subscription_participants_workspace_subscription_idx
  on public.subscription_participants (workspace_id, subscription_id);
create index subscription_versions_created_by_idx
  on public.subscription_versions (created_by);
create index subscription_versions_workspace_subscription_idx
  on public.subscription_versions (workspace_id, subscription_id);
create index subscriptions_created_by_idx
  on public.subscriptions (created_by);
