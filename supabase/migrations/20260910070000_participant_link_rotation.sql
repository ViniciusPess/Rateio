create or replace function app_private.rotate_participant_link_impl(
  p_participant_id uuid,
  p_token_hash bytea,
  p_token_last_four text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_workspace_id uuid;
  new_link_id uuid;
begin
  if caller_id is null then raise exception 'Autenticação necessária.'; end if;
  if octet_length(p_token_hash) <> 32 then raise exception 'Token inválido.'; end if;
  if p_token_last_four !~ '^[A-Za-z0-9_-]{4}$' then raise exception 'Identificador de token inválido.'; end if;

  select w.id into caller_workspace_id
  from public.workspaces w
  join public.participants p on p.workspace_id = w.id
  where w.owner_id = caller_id
    and p.id = p_participant_id
    and p.is_owner = false
    and p.archived_at is null;
  if caller_workspace_id is null then raise exception 'Participante não encontrado.'; end if;

  update public.participant_access_links
  set revoked_at = now()
  where workspace_id = caller_workspace_id
    and participant_id = p_participant_id
    and revoked_at is null;

  insert into public.participant_access_links (
    workspace_id, participant_id, token_hash, token_last_four, created_by
  ) values (
    caller_workspace_id, p_participant_id, p_token_hash, p_token_last_four, caller_id
  ) returning id into new_link_id;

  return new_link_id;
end;
$$;

create or replace function public.rotate_participant_link(
  p_participant_id uuid,
  p_token_hash bytea,
  p_token_last_four text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app_private.rotate_participant_link_impl(p_participant_id, p_token_hash, p_token_last_four);
$$;

revoke all on function app_private.rotate_participant_link_impl(uuid, bytea, text) from public, anon;
grant execute on function app_private.rotate_participant_link_impl(uuid, bytea, text) to authenticated;
revoke all on function public.rotate_participant_link(uuid, bytea, text) from public, anon;
grant execute on function public.rotate_participant_link(uuid, bytea, text) to authenticated;
