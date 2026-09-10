create extension if not exists pgcrypto with schema extensions;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id)
);

create table public.participants (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  email text,
  whatsapp text check (whatsapp is null or whatsapp ~ '^55[1-9][0-9]{9,10}$'),
  is_owner boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, auth_user_id),
  unique (workspace_id, id)
);

create unique index participants_workspace_email_unique
  on public.participants (workspace_id, lower(email))
  where email is not null;

create table public.subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  total_cents integer not null check (total_cents > 0),
  due_day smallint not null check (due_day between 1 and 31),
  split_mode text not null check (split_mode in ('equal', 'custom')),
  payment_instructions text not null default '' check (char_length(payment_instructions) <= 500),
  pix_key text not null default '' check (char_length(pix_key) <= 120),
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create index subscriptions_workspace_archived_idx
  on public.subscriptions (workspace_id, archived_at);

create table public.subscription_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  subscription_id uuid not null,
  effective_month text not null check (effective_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  total_cents integer not null check (total_cents > 0),
  due_day smallint not null check (due_day between 1 and 31),
  split_mode text not null check (split_mode in ('equal', 'custom')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (subscription_id, effective_month),
  foreign key (workspace_id, subscription_id)
    references public.subscriptions(workspace_id, id) on delete cascade
);

create index subscription_versions_workspace_month_idx
  on public.subscription_versions (workspace_id, effective_month);

create table public.subscription_participants (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  subscription_id uuid not null,
  participant_id uuid not null,
  start_month text not null check (start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  end_month text check (end_month is null or end_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  share_cents integer check (share_cents is null or share_cents >= 0),
  created_at timestamptz not null default now(),
  unique (subscription_id, participant_id, start_month),
  check (end_month is null or end_month >= start_month),
  foreign key (workspace_id, subscription_id)
    references public.subscriptions(workspace_id, id) on delete cascade,
  foreign key (workspace_id, participant_id)
    references public.participants(workspace_id, id) on delete restrict
);

create index subscription_participants_participant_month_idx
  on public.subscription_participants (workspace_id, participant_id, start_month, end_month);

create table public.charges (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  subscription_id uuid not null,
  participant_id uuid not null,
  billing_month text not null check (billing_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount_cents integer not null check (amount_cents >= 0),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'reported', 'confirmed')),
  acknowledged_at timestamptz,
  payment_reported_at timestamptz,
  payment_date date,
  confirmed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  return_reason text check (return_reason is null or char_length(return_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, participant_id, billing_month),
  unique (workspace_id, id),
  unique (workspace_id, id, participant_id),
  foreign key (workspace_id, subscription_id)
    references public.subscriptions(workspace_id, id) on delete cascade,
  foreign key (workspace_id, participant_id)
    references public.participants(workspace_id, id) on delete restrict
);

create index charges_workspace_month_idx
  on public.charges (workspace_id, billing_month);
create index charges_workspace_status_month_idx
  on public.charges (workspace_id, status, billing_month);
create index charges_participant_month_idx
  on public.charges (workspace_id, participant_id, billing_month);

create table public.notices (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  charge_id uuid not null,
  channel text not null check (channel in ('whatsapp', 'email', 'other')),
  sent_at timestamptz not null,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, charge_id)
    references public.charges(workspace_id, id) on delete cascade
);

create index notices_workspace_charge_idx on public.notices (workspace_id, charge_id);

create table public.payment_proofs (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  charge_id uuid not null,
  participant_id uuid not null,
  storage_key text not null check (char_length(storage_key) between 1 and 500),
  file_name text not null check (char_length(file_name) between 1 and 180),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  created_at timestamptz not null default now(),
  unique (charge_id),
  foreign key (workspace_id, charge_id, participant_id)
    references public.charges(workspace_id, id, participant_id) on delete cascade
);

create table public.audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_participant_id uuid,
  actor_label text not null check (char_length(actor_label) between 1 and 120),
  entity_type text not null check (char_length(entity_type) between 1 and 50),
  entity_id uuid not null,
  action text not null check (char_length(action) between 1 and 80),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (actor_user_id is not null or actor_participant_id is not null),
  foreign key (workspace_id, actor_participant_id)
    references public.participants(workspace_id, id) on delete restrict
);

create index audit_events_workspace_created_idx
  on public.audit_events (workspace_id, created_at desc);

create table public.participant_access_links (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  participant_id uuid not null,
  token_hash bytea not null,
  token_last_four text not null check (token_last_four ~ '^[A-Za-z0-9_-]{4}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  unique (token_hash),
  foreign key (workspace_id, participant_id)
    references public.participants(workspace_id, id) on delete cascade
);

create unique index participant_access_links_one_active_idx
  on public.participant_access_links (participant_id)
  where revoked_at is null;
create index participant_access_links_workspace_idx
  on public.participant_access_links (workspace_id, participant_id, revoked_at);

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function app_private.set_updated_at();
create trigger workspaces_set_updated_at before update on public.workspaces
for each row execute function app_private.set_updated_at();
create trigger participants_set_updated_at before update on public.participants
for each row execute function app_private.set_updated_at();
create trigger subscriptions_set_updated_at before update on public.subscriptions
for each row execute function app_private.set_updated_at();
create trigger charges_set_updated_at before update on public.charges
for each row execute function app_private.set_updated_at();

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_name text;
  new_workspace_id uuid;
begin
  resolved_name := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Usuário'
  ), 80);

  insert into public.profiles (id, display_name)
  values (new.id, resolved_name);

  insert into public.workspaces (owner_id, name)
  values (new.id, left('Rateio de ' || resolved_name, 80))
  returning id into new_workspace_id;

  insert into public.participants (
    workspace_id, auth_user_id, name, email, is_owner
  ) values (
    new_workspace_id, new.id, resolved_name, lower(new.email), true
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function app_private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.participants enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_versions enable row level security;
alter table public.subscription_participants enable row level security;
alter table public.charges enable row level security;
alter table public.notices enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.audit_events enable row level security;
alter table public.participant_access_links enable row level security;

create policy profiles_select_own on public.profiles
for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy workspaces_select_own on public.workspaces
for select to authenticated using (owner_id = (select auth.uid()));
create policy workspaces_update_own on public.workspaces
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy participants_owner_all on public.participants
for all to authenticated
using (exists (
  select 1 from public.workspaces w
  where w.id = participants.workspace_id and w.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.workspaces w
  where w.id = participants.workspace_id and w.owner_id = (select auth.uid())
));

create policy subscriptions_owner_all on public.subscriptions
for all to authenticated
using (exists (
  select 1 from public.workspaces w
  where w.id = subscriptions.workspace_id and w.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.workspaces w
  where w.id = subscriptions.workspace_id and w.owner_id = (select auth.uid())
) and created_by = (select auth.uid()));

create policy subscription_versions_owner_all on public.subscription_versions
for all to authenticated
using (exists (
  select 1 from public.workspaces w
  where w.id = subscription_versions.workspace_id and w.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.workspaces w
  where w.id = subscription_versions.workspace_id and w.owner_id = (select auth.uid())
) and created_by = (select auth.uid()));

create policy subscription_participants_owner_all on public.subscription_participants
for all to authenticated
using (exists (
  select 1 from public.workspaces w
  where w.id = subscription_participants.workspace_id and w.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.workspaces w
  where w.id = subscription_participants.workspace_id and w.owner_id = (select auth.uid())
));

create policy charges_owner_all on public.charges
for all to authenticated
using (exists (
  select 1 from public.workspaces w
  where w.id = charges.workspace_id and w.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.workspaces w
  where w.id = charges.workspace_id and w.owner_id = (select auth.uid())
) and (reviewed_by is null or reviewed_by = (select auth.uid())));

create policy notices_owner_all on public.notices
for all to authenticated
using (exists (
  select 1 from public.workspaces w
  where w.id = notices.workspace_id and w.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.workspaces w
  where w.id = notices.workspace_id and w.owner_id = (select auth.uid())
) and recorded_by = (select auth.uid()));

create policy payment_proofs_owner_all on public.payment_proofs
for all to authenticated
using (exists (
  select 1 from public.workspaces w
  where w.id = payment_proofs.workspace_id and w.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.workspaces w
  where w.id = payment_proofs.workspace_id and w.owner_id = (select auth.uid())
));

create policy audit_events_owner_all on public.audit_events
for all to authenticated
using (exists (
  select 1 from public.workspaces w
  where w.id = audit_events.workspace_id and w.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.workspaces w
  where w.id = audit_events.workspace_id and w.owner_id = (select auth.uid())
) and actor_user_id = (select auth.uid()));

create policy participant_access_links_owner_all on public.participant_access_links
for all to authenticated
using (exists (
  select 1 from public.workspaces w
  where w.id = participant_access_links.workspace_id and w.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.workspaces w
  where w.id = participant_access_links.workspace_id and w.owner_id = (select auth.uid())
));

revoke all on all tables in schema public from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.workspaces to authenticated;
grant select, insert, update on public.participants to authenticated;
grant select, insert, update on public.subscriptions to authenticated;
grant select, insert, update on public.subscription_versions to authenticated;
grant select, insert, update on public.subscription_participants to authenticated;
grant select, insert, update on public.charges to authenticated;
grant select, insert, update on public.notices to authenticated;
grant select, insert, update on public.payment_proofs to authenticated;
grant select, insert on public.audit_events to authenticated;

-- Links de acesso são administrados apenas no servidor. O hash nunca é exposto ao navegador.
revoke all on public.participant_access_links from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy payment_proofs_storage_owner_select on storage.objects
for select to authenticated
using (
  bucket_id = 'payment-proofs'
  and exists (
    select 1 from public.workspaces w
    where w.id::text = (storage.foldername(name))[1]
      and w.owner_id = (select auth.uid())
  )
);

create policy payment_proofs_storage_owner_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'payment-proofs'
  and exists (
    select 1 from public.workspaces w
    where w.id::text = (storage.foldername(name))[1]
      and w.owner_id = (select auth.uid())
  )
);
