create or replace function app_private.update_rateio_subscription_future_impl(
  p_subscription_id uuid,
  p_effective_month text,
  p_total_cents integer,
  p_due_day integer,
  p_split_mode text,
  p_members jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_workspace_id uuid;
  current_month text := to_char(current_date, 'YYYY-MM');
  item jsonb;
  resolved_participant_id uuid;
  participant_ids uuid[] := '{}'::uuid[];
  requested_shares integer[] := '{}'::integer[];
  participant_count integer;
  requested_total bigint := 0;
  position integer;
  calculated_share integer;
  normalized_email text;
  normalized_name text;
  normalized_whatsapp text;
  prior_month text;
  protected_count integer;
begin
  if caller_id is null then raise exception 'Autenticação necessária.'; end if;
  if p_effective_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_effective_month <= current_month then
    raise exception 'Escolha um mês futuro para alterar o rateio.';
  end if;
  if p_total_cents is null or p_total_cents <= 0 then raise exception 'Valor total inválido.'; end if;
  if p_due_day is null or p_due_day < 1 or p_due_day > 31 then raise exception 'Dia de vencimento inválido.'; end if;
  if p_split_mode not in ('equal', 'custom') then raise exception 'Modo de divisão inválido.'; end if;
  if jsonb_typeof(coalesce(p_members, '[]'::jsonb)) <> 'array' then raise exception 'Participantes inválidos.'; end if;
  if jsonb_array_length(coalesce(p_members, '[]'::jsonb)) > 30 then raise exception 'Limite de 30 participantes.'; end if;

  select id into caller_workspace_id
  from public.workspaces
  where owner_id = caller_id;
  if caller_workspace_id is null then raise exception 'Espaço do Rateio não encontrado.'; end if;
  if not exists (
    select 1 from public.subscriptions
    where id = p_subscription_id and workspace_id = caller_workspace_id
  ) then raise exception 'Assinatura não encontrada.'; end if;

  select count(*) into protected_count
  from public.charges c
  where c.workspace_id = caller_workspace_id
    and c.subscription_id = p_subscription_id
    and c.billing_month = p_effective_month
    and (
      c.status <> 'pending' or c.acknowledged_at is not null or c.payment_reported_at is not null
      or exists (select 1 from public.notices n where n.workspace_id = c.workspace_id and n.charge_id = c.id)
      or exists (select 1 from public.payment_proofs p where p.workspace_id = c.workspace_id and p.charge_id = c.id)
    );
  if protected_count > 0 then
    raise exception 'Este mês já possui movimentações e não pode ser reprogramado.';
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_members, '[]'::jsonb))
  loop
    resolved_participant_id := nullif(item ->> 'participantId', '')::uuid;
    if resolved_participant_id is not null then
      if not exists (
        select 1 from public.participants
        where id = resolved_participant_id and workspace_id = caller_workspace_id and archived_at is null
      ) then raise exception 'Participante inválido.'; end if;
    else
      normalized_email := lower(nullif(btrim(item ->> 'email'), ''));
      normalized_name := nullif(btrim(item ->> 'name'), '');
      normalized_whatsapp := nullif(regexp_replace(coalesce(item ->> 'whatsapp', ''), '[^0-9]', '', 'g'), '');
      if normalized_email is null or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'E-mail de participante inválido.'; end if;
      if normalized_name is null or char_length(normalized_name) > 80 then raise exception 'Nome de participante inválido.'; end if;
      if normalized_whatsapp is not null and normalized_whatsapp !~ '^55[1-9][0-9]{9,10}$' then raise exception 'WhatsApp de participante inválido.'; end if;
      select id into resolved_participant_id from public.participants
      where workspace_id = caller_workspace_id and lower(email) = normalized_email;
      if resolved_participant_id is null then
        insert into public.participants (workspace_id, name, email, whatsapp)
        values (caller_workspace_id, normalized_name, normalized_email, normalized_whatsapp)
        returning id into resolved_participant_id;
      else
        update public.participants set name = normalized_name,
          whatsapp = coalesce(normalized_whatsapp, whatsapp), archived_at = null
        where id = resolved_participant_id and workspace_id = caller_workspace_id;
      end if;
    end if;

    if not (resolved_participant_id = any(participant_ids)) then
      participant_ids := array_append(participant_ids, resolved_participant_id);
      requested_shares := array_append(requested_shares, nullif(item ->> 'shareCents', '')::integer);
    end if;
  end loop;

  participant_count := coalesce(array_length(participant_ids, 1), 0);
  if participant_count = 0 then raise exception 'Adicione ao menos uma pessoa ao rateio.'; end if;
  if p_split_mode = 'custom' then
    for position in 1..participant_count loop
      if requested_shares[position] is null or requested_shares[position] < 0 then raise exception 'Informe todas as partes da divisão personalizada.'; end if;
      requested_total := requested_total + requested_shares[position];
    end loop;
    if requested_total <> p_total_cents then raise exception 'As partes precisam somar exatamente o valor total.'; end if;
  end if;

  prior_month := to_char((to_date(p_effective_month || '-01', 'YYYY-MM-DD') - interval '1 month')::date, 'YYYY-MM');

  delete from public.charges
  where workspace_id = caller_workspace_id and subscription_id = p_subscription_id and billing_month = p_effective_month;
  delete from public.subscription_participants
  where workspace_id = caller_workspace_id and subscription_id = p_subscription_id and start_month = p_effective_month;
  update public.subscription_participants set end_month = prior_month
  where workspace_id = caller_workspace_id and subscription_id = p_subscription_id
    and start_month < p_effective_month and (end_month is null or end_month >= p_effective_month);

  insert into public.subscription_versions (
    workspace_id, subscription_id, effective_month, total_cents, due_day, split_mode, created_by
  ) values (
    caller_workspace_id, p_subscription_id, p_effective_month, p_total_cents, p_due_day, p_split_mode, caller_id
  ) on conflict (subscription_id, effective_month) do update set
    total_cents = excluded.total_cents,
    due_day = excluded.due_day,
    split_mode = excluded.split_mode,
    created_by = excluded.created_by;

  update public.subscriptions
  set total_cents = p_total_cents, due_day = p_due_day, split_mode = p_split_mode
  where id = p_subscription_id and workspace_id = caller_workspace_id;

  for position in 1..participant_count loop
    calculated_share := case
      when p_split_mode = 'custom' then requested_shares[position]
      else (p_total_cents / participant_count)
        + case when position <= (p_total_cents % participant_count) then 1 else 0 end
    end;
    insert into public.subscription_participants (
      workspace_id, subscription_id, participant_id, start_month, share_cents
    ) values (
      caller_workspace_id, p_subscription_id, participant_ids[position], p_effective_month, calculated_share
    );
    insert into public.charges (
      workspace_id, subscription_id, participant_id, billing_month, amount_cents, due_date
    ) values (
      caller_workspace_id, p_subscription_id, participant_ids[position], p_effective_month,
      calculated_share, app_private.due_date_for_month(p_effective_month, p_due_day)
    );
  end loop;

  insert into public.audit_events (
    workspace_id, actor_user_id, actor_label, entity_type, entity_id, action, details
  ) select caller_workspace_id, caller_id, display_name, 'subscription', p_subscription_id,
    'future_split_updated', jsonb_build_object(
      'effectiveMonth', p_effective_month, 'totalCents', p_total_cents,
      'dueDay', p_due_day, 'participantCount', participant_count
    ) from public.profiles where id = caller_id;
end;
$$;

create or replace function public.update_rateio_subscription_future(
  p_subscription_id uuid,
  p_effective_month text,
  p_total_cents integer,
  p_due_day integer,
  p_split_mode text,
  p_members jsonb
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app_private.update_rateio_subscription_future_impl(
    p_subscription_id, p_effective_month, p_total_cents, p_due_day, p_split_mode, p_members
  );
$$;

grant usage on schema app_private to authenticated;
revoke all on function app_private.update_rateio_subscription_future_impl(uuid, text, integer, integer, text, jsonb) from public, anon;
grant execute on function app_private.update_rateio_subscription_future_impl(uuid, text, integer, integer, text, jsonb) to authenticated;
revoke all on function public.update_rateio_subscription_future(uuid, text, integer, integer, text, jsonb) from public, anon;
grant execute on function public.update_rateio_subscription_future(uuid, text, integer, integer, text, jsonb) to authenticated;
