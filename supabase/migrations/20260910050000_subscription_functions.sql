create or replace function app_private.due_date_for_month(p_month text, p_due_day integer)
returns date
language sql
immutable
security invoker
set search_path = ''
as $$
  select make_date(
    split_part(p_month, '-', 1)::integer,
    split_part(p_month, '-', 2)::integer,
    1
  ) + (
    least(
      p_due_day,
      extract(day from (
        make_date(split_part(p_month, '-', 1)::integer, split_part(p_month, '-', 2)::integer, 1)
          + interval '1 month - 1 day'
      ))::integer
    ) - 1
  );
$$;

create or replace function public.ensure_month_charges(p_month text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_workspace_id uuid;
  inserted_count integer;
begin
  if caller_id is null then raise exception 'Autenticação necessária.'; end if;
  if p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Mês inválido.'; end if;

  select id into caller_workspace_id
  from public.workspaces
  where owner_id = caller_id;
  if caller_workspace_id is null then raise exception 'Espaço do Rateio não encontrado.'; end if;

  with current_versions as (
    select distinct on (v.subscription_id)
      v.subscription_id, v.total_cents, v.due_day, v.split_mode
    from public.subscription_versions v
    join public.subscriptions s
      on s.workspace_id = v.workspace_id and s.id = v.subscription_id
    where v.workspace_id = caller_workspace_id
      and v.effective_month <= p_month
      and s.archived_at is null
    order by v.subscription_id, v.effective_month desc
  ), active_members as (
    select
      sp.subscription_id,
      sp.participant_id,
      sp.share_cents,
      cv.total_cents,
      cv.due_day,
      cv.split_mode,
      count(*) over (partition by sp.subscription_id) as member_count,
      row_number() over (partition by sp.subscription_id order by sp.participant_id) as member_position
    from public.subscription_participants sp
    join current_versions cv on cv.subscription_id = sp.subscription_id
    where sp.workspace_id = caller_workspace_id
      and sp.start_month <= p_month
      and (sp.end_month is null or sp.end_month >= p_month)
  )
  insert into public.charges (
    workspace_id, subscription_id, participant_id, billing_month, amount_cents, due_date
  )
  select
    caller_workspace_id,
    am.subscription_id,
    am.participant_id,
    p_month,
    case
      when am.split_mode = 'custom' then coalesce(am.share_cents, 0)
      else (am.total_cents / am.member_count)::integer
        + case when am.member_position <= (am.total_cents % am.member_count) then 1 else 0 end
    end,
    app_private.due_date_for_month(p_month, am.due_day)
  from active_members am
  on conflict (subscription_id, participant_id, billing_month) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.create_rateio_subscription(
  p_name text,
  p_total_cents integer,
  p_due_day integer,
  p_split_mode text,
  p_pix_key text,
  p_payment_instructions text,
  p_include_self boolean,
  p_participants jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_workspace_id uuid;
  self_participant_id uuid;
  new_subscription_id uuid;
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
begin
  if caller_id is null then raise exception 'Autenticação necessária.'; end if;
  if nullif(btrim(p_name), '') is null or char_length(btrim(p_name)) > 80 then
    raise exception 'Informe um nome de até 80 caracteres.';
  end if;
  if p_total_cents is null or p_total_cents <= 0 then raise exception 'Valor total inválido.'; end if;
  if p_due_day is null or p_due_day < 1 or p_due_day > 31 then raise exception 'Dia de vencimento inválido.'; end if;
  if p_split_mode not in ('equal', 'custom') then raise exception 'Modo de divisão inválido.'; end if;
  if jsonb_typeof(coalesce(p_participants, '[]'::jsonb)) <> 'array' then raise exception 'Participantes inválidos.'; end if;
  if jsonb_array_length(coalesce(p_participants, '[]'::jsonb)) > 30 then raise exception 'Limite de 30 participantes.'; end if;

  select w.id, p.id into caller_workspace_id, self_participant_id
  from public.workspaces w
  join public.participants p on p.workspace_id = w.id and p.auth_user_id = caller_id
  where w.owner_id = caller_id;
  if caller_workspace_id is null then raise exception 'Espaço do Rateio não encontrado.'; end if;

  if coalesce(p_include_self, true) then
    participant_ids := array_append(participant_ids, self_participant_id);
    requested_shares := array_append(requested_shares, null);
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_participants, '[]'::jsonb))
  loop
    normalized_email := lower(nullif(btrim(item ->> 'email'), ''));
    normalized_name := nullif(btrim(item ->> 'name'), '');
    normalized_whatsapp := nullif(regexp_replace(coalesce(item ->> 'whatsapp', ''), '[^0-9]', '', 'g'), '');
    if normalized_email is null or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'E-mail de participante inválido.'; end if;
    if normalized_name is null or char_length(normalized_name) > 80 then raise exception 'Nome de participante inválido.'; end if;
    if normalized_whatsapp is not null and normalized_whatsapp !~ '^55[1-9][0-9]{9,10}$' then raise exception 'WhatsApp de participante inválido.'; end if;

    select id into resolved_participant_id
    from public.participants
    where workspace_id = caller_workspace_id and lower(email) = normalized_email;

    if resolved_participant_id is null then
      insert into public.participants (workspace_id, name, email, whatsapp)
      values (caller_workspace_id, normalized_name, normalized_email, normalized_whatsapp)
      returning id into resolved_participant_id;
    else
      update public.participants
      set name = normalized_name,
          whatsapp = coalesce(normalized_whatsapp, whatsapp),
          archived_at = null
      where id = resolved_participant_id and workspace_id = caller_workspace_id;
    end if;

    if resolved_participant_id = any(participant_ids) then
      position := array_position(participant_ids, resolved_participant_id);
      if nullif(item ->> 'shareCents', '') is not null then
        requested_shares[position] := (item ->> 'shareCents')::integer;
      end if;
    else
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

  insert into public.subscriptions (
    workspace_id, name, total_cents, due_day, split_mode, payment_instructions, pix_key, created_by
  ) values (
    caller_workspace_id, btrim(p_name), p_total_cents, p_due_day, p_split_mode,
    left(coalesce(btrim(p_payment_instructions), ''), 500), left(coalesce(btrim(p_pix_key), ''), 120), caller_id
  ) returning id into new_subscription_id;

  insert into public.subscription_versions (
    workspace_id, subscription_id, effective_month, total_cents, due_day, split_mode, created_by
  ) values (
    caller_workspace_id, new_subscription_id, current_month, p_total_cents, p_due_day, p_split_mode, caller_id
  );

  for position in 1..participant_count loop
    calculated_share := case
      when p_split_mode = 'custom' then requested_shares[position]
      else (p_total_cents / participant_count)
        + case when position <= (p_total_cents % participant_count) then 1 else 0 end
    end;

    insert into public.subscription_participants (
      workspace_id, subscription_id, participant_id, start_month, share_cents
    ) values (
      caller_workspace_id, new_subscription_id, participant_ids[position], current_month, calculated_share
    );

    insert into public.charges (
      workspace_id, subscription_id, participant_id, billing_month, amount_cents, due_date
    ) values (
      caller_workspace_id, new_subscription_id, participant_ids[position], current_month,
      calculated_share, app_private.due_date_for_month(current_month, p_due_day)
    );
  end loop;

  insert into public.audit_events (
    workspace_id, actor_user_id, actor_label, entity_type, entity_id, action, details
  )
  select caller_workspace_id, caller_id, display_name, 'subscription', new_subscription_id,
    'subscription_created', jsonb_build_object('name', btrim(p_name), 'totalCents', p_total_cents, 'participantCount', participant_count)
  from public.profiles where id = caller_id;

  return new_subscription_id;
end;
$$;

revoke all on function public.ensure_month_charges(text) from public, anon;
grant execute on function public.ensure_month_charges(text) to authenticated;
revoke all on function public.create_rateio_subscription(text, integer, integer, text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.create_rateio_subscription(text, integer, integer, text, text, text, boolean, jsonb) to authenticated;
