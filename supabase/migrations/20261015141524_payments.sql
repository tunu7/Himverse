-- Online deposits with Razorpay (ADR-0005, accepted with owner decisions 2026-10-15).
--
-- Owner decisions:
--   * Himverse collects on one Razorpay account; partners are paid out manually and
--     the payouts are recorded here.
--   * A 50% deposit is paid online after the partner confirms; the rest is paid to
--     the partner on the day.
--   * The deposit is due within 24 hours of confirmation (or by the start, if
--     sooner); unpaid bookings are cancelled automatically.
--   * Refunds when the traveller cancels: full 7+ days before the start, 50% between
--     7 days and 24 hours (no traveller cancellation inside 24 hours, as before).
--     Partner and system cancellations refund in full.
--
-- Payment state changes only through service functions called by the webhook
-- route or after a server-side check with Razorpay (never from the browser).
-- Nothing changes until an admin turns on "deposits required".

-- ---------------------------------------------------------------------------
-- Platform switch
-- ---------------------------------------------------------------------------

create table public.platform_settings (
  id boolean primary key default true constraint platform_settings_single_row check (id),
  deposits_required boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.platform_settings (id) values (true);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
grant select (deposits_required) on public.platform_settings to anon, authenticated;
create policy "everyone reads platform settings"
  on public.platform_settings for select to anon, authenticated using (true);

create function public.set_deposits_required(p_required boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role('admin') then
    raise exception 'only admins can change payment settings' using errcode = '42501';
  end if;
  update public.platform_settings
  set deposits_required = p_required, updated_at = now(), updated_by = (select auth.uid())
  where id;
  return p_required;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deposit terms on bookings
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column deposit_minor bigint constraint bookings_deposit_positive check (deposit_minor > 0),
  add column payment_due_at timestamptz,
  add column deposit_paid_at timestamptz,
  add constraint bookings_deposit_terms_complete check ((deposit_minor is null) = (payment_due_at is null));
create index bookings_unpaid_due_idx on public.bookings (payment_due_at)
  where status = 'confirmed' and deposit_paid_at is null and payment_due_at is not null;

-- When a booking is confirmed (by the partner, or by the traveller accepting a
-- price) and deposits are required, set 50% of the confirmed total as a deposit
-- due within 24 hours or by the start. Razorpay's minimum is INR 1.00.
create function private.set_deposit_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed'
     and new.deposit_minor is null
     and coalesce(new.confirmed_total_minor, 0) >= 200
     and (select s.deposits_required from public.platform_settings s where s.id) then
    new.deposit_minor := (new.confirmed_total_minor + 1) / 2;
    new.payment_due_at := least(
      now() + interval '24 hours',
      private.slot_starts_at(new.slot_starts_on, new.slot_start_time)
    );
  end if;
  return new;
end;
$$;
revoke all on function private.set_deposit_terms() from public, anon, authenticated;
create trigger bookings_c_deposit_terms
  before update of status on public.bookings
  for each row execute function private.set_deposit_terms();

-- ---------------------------------------------------------------------------
-- Payments, refunds, webhook log, partner payouts
-- ---------------------------------------------------------------------------

create type public.payment_status as enum ('created', 'captured', 'failed');
create type public.refund_status as enum ('pending', 'processed', 'failed');

-- One row per Razorpay order (one checkout attempt). At most one captured per booking.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  provider_id uuid not null references public.providers (id) on delete restrict,
  amount_minor bigint not null constraint payments_amount_min check (amount_minor >= 100),
  currency text not null default 'INR' constraint payments_currency_inr check (currency = 'INR'),
  razorpay_order_id text not null unique
    constraint payments_order_id_format check (razorpay_order_id ~ '^order_[A-Za-z0-9]{8,40}$'),
  razorpay_payment_id text unique
    constraint payments_payment_id_format check (razorpay_payment_id ~ '^pay_[A-Za-z0-9]{8,40}$'),
  status public.payment_status not null default 'created',
  refunded_minor bigint not null default 0,
  created_at timestamptz not null default now(),
  captured_at timestamptz,
  constraint payments_refunded_range check (refunded_minor between 0 and amount_minor),
  constraint payments_captured_complete check ((status = 'captured') = (captured_at is not null)),
  constraint payments_captured_has_payment check (status <> 'captured' or razorpay_payment_id is not null)
);
create index payments_booking_idx on public.payments (booking_id, created_at desc);
create index payments_provider_idx on public.payments (provider_id);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments (id) on delete restrict,
  booking_id uuid not null references public.bookings (id) on delete restrict,
  amount_minor bigint not null constraint refunds_amount_positive check (amount_minor > 0),
  reason text not null constraint refunds_reason_length check (char_length(reason) between 1 and 200),
  status public.refund_status not null default 'pending',
  razorpay_refund_id text unique
    constraint refunds_refund_id_format check (razorpay_refund_id ~ '^rfnd_[A-Za-z0-9]{8,40}$'),
  attempts integer not null default 0,
  -- Set while one worker is sending this refund, so concurrent runs can't send it twice.
  claimed_until timestamptz,
  last_error text constraint refunds_error_length check (char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index refunds_booking_idx on public.refunds (booking_id);
create index refunds_open_idx on public.refunds (created_at) where status = 'pending';

-- Every webhook delivery, deduplicated by Razorpay's event id. Only ids, amounts
-- and statuses are kept (no payer email, phone or card details).
create table public.payment_events (
  id bigint generated always as identity primary key,
  event_id text not null unique constraint payment_events_id_length check (char_length(event_id) between 1 and 100),
  event_type text not null constraint payment_events_type_length check (char_length(event_type) between 1 and 60),
  summary jsonb not null default '{}',
  result text constraint payment_events_result_length check (char_length(result) <= 200),
  received_at timestamptz not null default now()
);

create table public.partner_payouts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete restrict,
  amount_minor bigint not null constraint partner_payouts_amount_positive check (amount_minor > 0),
  reference text not null constraint partner_payouts_reference_length check (char_length(reference) between 1 and 100),
  note text not null default '' constraint partner_payouts_note_length check (char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- One bank transfer is recorded once, even if the form is submitted twice.
  constraint partner_payouts_reference_unique unique (provider_id, reference)
);
revoke all on sequence public.payment_events_id_seq from anon, authenticated;

create index partner_payouts_provider_idx on public.partner_payouts (provider_id, created_at desc);
create index partner_payouts_created_by_idx on public.partner_payouts (created_by);

alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.payment_events enable row level security;
alter table public.partner_payouts enable row level security;

revoke all on public.payments, public.refunds, public.payment_events, public.partner_payouts
  from anon, authenticated;
grant select (id, booking_id, provider_id, amount_minor, currency, status, refunded_minor, created_at, captured_at)
  on public.payments to authenticated;
grant select (id, payment_id, booking_id, amount_minor, reason, status, created_at, processed_at)
  on public.refunds to authenticated;
grant select on public.payment_events to authenticated;
grant select (id, provider_id, amount_minor, reference, note, created_at) on public.partner_payouts to authenticated;

create policy "booking parties read payments"
  on public.payments for select to authenticated using (private.can_view_booking(booking_id));
create policy "booking parties read refunds"
  on public.refunds for select to authenticated using (private.can_view_booking(booking_id));
create policy "admins read payment events"
  on public.payment_events for select to authenticated using (private.has_role('admin'));
create policy "partners and admins read payouts"
  on public.partner_payouts for select to authenticated
  using (private.is_provider_member(provider_id) or private.has_role('admin'));

-- ---------------------------------------------------------------------------
-- Refunds on cancellation
-- ---------------------------------------------------------------------------

-- The refund owed when a booking with a captured deposit is cancelled.
create function private.queue_refund(p_payment_id uuid, p_amount_minor bigint, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.refunds (payment_id, booking_id, amount_minor, reason)
  select p.id, p.booking_id, least(p_amount_minor, p.amount_minor - p.refunded_minor), p_reason
  from public.payments p
  where p.id = p_payment_id and p.status = 'captured'
    and least(p_amount_minor, p.amount_minor - p.refunded_minor) > 0
  on conflict (payment_id) do nothing;
$$;

create function private.refund_on_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_starts_at timestamptz := private.slot_starts_at(new.slot_starts_on, new.slot_start_time);
begin
  select p.* into v_payment from public.payments p
  where p.booking_id = new.id and p.status = 'captured';
  if not found then
    return null;
  end if;
  if new.cancelled_by = 'traveler' then
    perform private.queue_refund(
      v_payment.id,
      case when v_starts_at - now() >= interval '7 days' then v_payment.amount_minor
           else v_payment.amount_minor / 2 end,
      case when v_starts_at - now() >= interval '7 days'
           then 'Cancelled by the traveller 7 or more days before the start: full refund.'
           else 'Cancelled by the traveller less than 7 days before the start: 50% refund.' end);
  else
    perform private.queue_refund(v_payment.id, v_payment.amount_minor,
      'Cancelled by the partner or Himverse: full refund.');
  end if;
  return null;
end;
$$;
create trigger bookings_refund_on_cancellation
  after update of status on public.bookings
  for each row
  when (new.status = 'cancelled' and old.status = 'confirmed' and new.deposit_paid_at is not null)
  execute function private.refund_on_cancellation();

-- ---------------------------------------------------------------------------
-- Traveller: start paying a deposit
-- ---------------------------------------------------------------------------

-- What to pay, for the caller's own confirmed, unpaid booking. Returns a recent
-- unpaid order to reuse when the traveller retries within 30 minutes.
create function public.deposit_checkout(p_booking_id uuid)
returns table (booking_reference text, amount_minor bigint, currency text, payment_due_at timestamptz,
  attempt integer, reusable_order_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.traveler_id = (select auth.uid());
  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if v_booking.status <> 'confirmed' or v_booking.deposit_minor is null then
    raise exception 'this booking has no deposit to pay' using errcode = '55000';
  end if;
  if v_booking.deposit_paid_at is not null then
    raise exception 'the deposit is already paid' using errcode = '55000';
  end if;
  if v_booking.payment_due_at <= now() then
    raise exception 'the deposit deadline has passed' using errcode = '55000';
  end if;
  return query
    select v_booking.reference, v_booking.deposit_minor, 'INR'::text, v_booking.payment_due_at,
      (select count(*)::integer + 1 from public.payments p where p.booking_id = v_booking.id),
      (select p.razorpay_order_id from public.payments p
       where p.booking_id = v_booking.id and p.status = 'created' and p.amount_minor = v_booking.deposit_minor
         and p.created_at > now() - interval '30 minutes'
       order by p.created_at desc limit 1);
end;
$$;

-- Records the Razorpay order the server just created for a traveller's deposit.
-- System path only (the app passes the signed-in traveller): orders can't be
-- invented through the API.
create function public.attach_deposit_order(
  p_booking_id uuid,
  p_traveler_id uuid,
  p_order_id text,
  p_amount_minor bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.traveler_id = p_traveler_id
  for update;
  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if v_booking.status <> 'confirmed' or v_booking.deposit_paid_at is not null
     or v_booking.deposit_minor is distinct from p_amount_minor or v_booking.payment_due_at <= now() then
    raise exception 'this booking has no deposit to pay' using errcode = '55000';
  end if;
  insert into public.payments (booking_id, provider_id, amount_minor, razorpay_order_id)
  values (v_booking.id, v_booking.provider_id, p_amount_minor, p_order_id)
  on conflict (razorpay_order_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- System (service role): record what Razorpay reports
-- ---------------------------------------------------------------------------

-- Idempotent and monotonic. Amount or currency mismatches are refused (the
-- caller logs and alerts). A capture for a booking that is no longer awaiting a
-- deposit (cancelled, or already paid by another order) is refunded in full.
create function public.record_razorpay_payment(
  p_order_id text,
  p_payment_id text,
  p_status text,
  p_amount_minor bigint,
  p_currency text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_booking public.bookings;
begin
  select p.* into v_payment from public.payments p where p.razorpay_order_id = p_order_id for update;
  if not found then
    return 'unknown_order';
  end if;
  if p_amount_minor is distinct from v_payment.amount_minor or p_currency is distinct from v_payment.currency then
    raise exception 'amount or currency does not match the order' using errcode = '22023';
  end if;

  -- A failed attempt doesn't close the order: Checkout can retry on it and succeed.
  if p_status = 'failed' then
    return 'failed_attempt';
  end if;
  if p_status <> 'captured' then
    return 'ignored';
  end if;
  if v_payment.status = 'captured' then
    -- Razorpay accepts no further payments on a paid order; a different payment id
    -- here needs a person (logged by the caller, refunded from the Dashboard).
    return case when v_payment.razorpay_payment_id = p_payment_id then 'duplicate' else 'extra_payment' end;
  end if;

  update public.payments
  set status = 'captured', razorpay_payment_id = p_payment_id, captured_at = now()
  where id = v_payment.id;

  select b.* into v_booking from public.bookings b where b.id = v_payment.booking_id for update;
  if v_booking.status = 'confirmed' and v_booking.deposit_paid_at is null then
    update public.bookings set deposit_paid_at = now() where id = v_booking.id;
    insert into public.booking_events (booking_id, from_status, to_status, actor_role, note)
    values (v_booking.id, 'confirmed', 'confirmed', 'system', 'Deposit paid online.');
    return 'captured';
  end if;
  perform private.queue_refund(v_payment.id, v_payment.amount_minor,
    'Payment arrived after the booking was cancelled or already paid: full refund.');
  return 'refund_queued';
end;
$$;

create function public.record_razorpay_refund(
  p_status text,
  p_refund_uuid uuid default null,
  p_razorpay_refund_id text default null,
  p_error text default null,
  p_razorpay_payment_id text default null,
  p_amount_minor bigint default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.refunds;
  v_payment public.payments;
begin
  if p_status not in ('submitted', 'processed', 'failed', 'error') then
    raise exception 'unknown refund status' using errcode = '22023';
  end if;
  if p_refund_uuid is not null then
    select r.* into v_refund from public.refunds r where r.id = p_refund_uuid for update;
  end if;
  if v_refund.id is null and p_razorpay_refund_id is not null then
    select r.* into v_refund from public.refunds r where r.razorpay_refund_id = p_razorpay_refund_id for update;
  end if;
  if v_refund.id is null and p_razorpay_payment_id is not null then
    select p.* into v_payment from public.payments p where p.razorpay_payment_id = p_razorpay_payment_id for update;
    if v_payment.id is null then
      return 'unknown_refund';
    end if;
    select r.* into v_refund from public.refunds r where r.payment_id = v_payment.id for update;
    if v_refund.id is null then
      -- A refund made by hand in the Razorpay Dashboard: record it so balances stay right.
      if p_status <> 'processed' or p_amount_minor is null
         or p_amount_minor > v_payment.amount_minor - v_payment.refunded_minor then
        return 'unknown_refund';
      end if;
      insert into public.refunds (payment_id, booking_id, amount_minor, reason, status, razorpay_refund_id, processed_at)
      values (v_payment.id, v_payment.booking_id, p_amount_minor, 'Refunded in the Razorpay Dashboard.',
        'processed', p_razorpay_refund_id, now());
      update public.payments set refunded_minor = refunded_minor + p_amount_minor where id = v_payment.id;
      return 'recorded_manual_refund';
    end if;
  end if;
  if v_refund.id is null then
    return 'unknown_refund';
  end if;
  if v_refund.status = 'processed' then
    return 'duplicate';
  end if;
  if v_refund.razorpay_refund_id is not null and p_razorpay_refund_id is not null
     and v_refund.razorpay_refund_id <> p_razorpay_refund_id then
    -- Two Razorpay refunds for one of ours: never silently merge them.
    return 'conflicting_refund';
  end if;
  if p_amount_minor is not null and p_amount_minor <> v_refund.amount_minor then
    return 'amount_mismatch';
  end if;
  update public.refunds
  set razorpay_refund_id = coalesce(razorpay_refund_id, p_razorpay_refund_id),
      claimed_until = null,
      last_error = case when p_status = 'error' then left(coalesce(p_error, 'unknown error'), 300) else last_error end,
      status = case p_status when 'processed' then 'processed'::public.refund_status
                             when 'failed' then 'failed'::public.refund_status
                             else status end,
      processed_at = case when p_status = 'processed' then now() else processed_at end
  where id = v_refund.id;
  if p_status = 'processed' then
    update public.payments set refunded_minor = refunded_minor + v_refund.amount_minor
    where id = v_refund.payment_id;
  end if;
  return p_status;
end;
$$;

-- Claims refunds to send to Razorpay (new, or earlier attempts that errored):
-- each is claimed by one worker for 5 minutes, so concurrent runs never send the
-- same refund twice. Razorpay's idempotency key (the refund id) covers retries.
create function public.claim_refunds(p_limit integer default 20, p_booking_id uuid default null)
returns table (refund_id uuid, razorpay_payment_id text, amount_minor bigint, booking_reference text)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.refunds r
    set attempts = r.attempts + 1, claimed_until = now() + interval '5 minutes'
    where r.id in (
      select c.id from public.refunds c
      where c.status = 'pending' and c.razorpay_refund_id is null and c.attempts < 10
        and (c.claimed_until is null or c.claimed_until < now())
        and (p_booking_id is null or c.booking_id = p_booking_id)
      order by c.created_at
      limit least(greatest(p_limit, 1), 100)
      for update skip locked
    )
    returning r.id, r.payment_id, r.amount_minor, r.booking_id
  )
  select c.id, p.razorpay_payment_id, c.amount_minor, b.reference
  from claimed c
  join public.payments p on p.id = c.payment_id
  join public.bookings b on b.id = c.booking_id;
$$;

-- Sent refunds still pending after an hour: the daily job asks Razorpay (missed webhooks).
create function public.refunds_to_check(p_limit integer default 50)
returns table (refund_id uuid, razorpay_refund_id text)
language sql
security definer
set search_path = ''
as $$
  select r.id, r.razorpay_refund_id from public.refunds r
  where r.status = 'pending' and r.razorpay_refund_id is not null
    and r.created_at < now() - interval '1 hour'
  order by r.created_at
  limit least(greatest(p_limit, 1), 200);
$$;

-- Orders from the last three days still shown as unpaid: the daily job asks
-- Razorpay about them, in case a webhook was missed.
create function public.payments_to_reconcile(p_limit integer default 50)
returns table (razorpay_order_id text)
language sql
security definer
set search_path = ''
as $$
  select p.razorpay_order_id from public.payments p
  where p.status = 'created' and p.created_at > now() - interval '3 days'
    and p.created_at < now() - interval '15 minutes'
  order by p.created_at
  limit least(greatest(p_limit, 1), 200);
$$;

-- Webhook deliveries: true when this delivery should be processed (first time, or a
-- retry of one whose processing failed).
create function public.log_payment_event(p_event_id text, p_event_type text, p_summary jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.payment_events (event_id, event_type, summary)
  values (p_event_id, p_event_type, coalesce(p_summary, '{}'))
  on conflict (event_id) do update set received_at = now()
    -- Not finished (processing failed) and not being processed right now: take it again.
    where public.payment_events.result is null
      and public.payment_events.received_at < now() - interval '2 minutes';
  return found;
end;
$$;

create function public.finish_payment_event(p_event_id text, p_result text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payment_events set result = left(p_result, 200) where event_id = p_event_id;
$$;

-- ---------------------------------------------------------------------------
-- Unpaid deposits: cancel after the deadline (pg_cron, every 15 minutes)
-- ---------------------------------------------------------------------------

create function private.cancel_unpaid_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_count integer := 0;
begin
  for v_booking in
    select b.id, b.slot_id, b.party_size from public.bookings b
    where b.status = 'confirmed' and b.deposit_paid_at is null and b.payment_due_at <= now()
      -- A checkout started just before the deadline gets 30 more minutes to complete.
      and (b.payment_due_at <= now() - interval '30 minutes'
        or not exists (select 1 from public.payments p
                       where p.booking_id = b.id and p.created_at > b.payment_due_at - interval '15 minutes'))
    order by b.payment_due_at
    for update skip locked
  loop
    if v_booking.slot_id is not null then
      update public.availability_slots set seats_confirmed = seats_confirmed - v_booking.party_size
      where id = v_booking.slot_id;
    end if;
    update public.bookings
    set status = 'cancelled', cancelled_by = 'system', cancellation_reason = 'The deposit was not paid in time.'
    where id = v_booking.id;
    insert into public.booking_events (booking_id, from_status, to_status, actor_role, note)
    values (v_booking.id, 'confirmed', 'cancelled', 'system', 'The deposit was not paid in time.');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
select cron.schedule('himverse-unpaid-deposits', '*/15 * * * *', 'select private.cancel_unpaid_bookings()');

-- ---------------------------------------------------------------------------
-- Partner balances and payouts (Himverse pays partners manually)
-- ---------------------------------------------------------------------------

-- Collected = captured deposits. Deposits are held while a booking can still be
-- refunded (confirmed, upcoming); they become payable once the booking is completed,
-- or cancelled with its refund decided. Owed = payable minus refunds sent, pending
-- or failed (still owed to the traveller), minus payouts.
create function private.partner_balance(p_provider_id uuid)
returns table (collected_minor bigint, refunded_minor bigint, pending_refunds_minor bigint,
  held_minor bigint, paid_out_minor bigint, owed_minor bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with deposits as (
    select p.amount_minor, p.refunded_minor, b.status in ('completed', 'cancelled') as settled,
      coalesce((select sum(r.amount_minor) from public.refunds r
                where r.payment_id = p.id and r.status in ('pending', 'failed')), 0) as open_refunds
    from public.payments p join public.bookings b on b.id = p.booking_id
    where p.provider_id = p_provider_id and p.status = 'captured'
  ), totals as (
    select
      coalesce(sum(amount_minor), 0)::bigint as collected,
      coalesce(sum(refunded_minor), 0)::bigint as refunded,
      coalesce(sum(open_refunds), 0)::bigint as open_refunds,
      coalesce(sum(amount_minor) filter (where not settled), 0)::bigint as held,
      coalesce(sum(amount_minor - refunded_minor - open_refunds) filter (where settled), 0)::bigint as payable,
      coalesce((select sum(o.amount_minor) from public.partner_payouts o where o.provider_id = p_provider_id), 0)::bigint as paid
    from deposits
  )
  select collected, refunded, open_refunds, held, paid, payable - paid from totals;
$$;
revoke all on function private.partner_balance(uuid) from public, anon, authenticated;

create function public.partner_payment_summary(p_provider_id uuid)
returns table (collected_minor bigint, refunded_minor bigint, pending_refunds_minor bigint,
  held_minor bigint, paid_out_minor bigint, owed_minor bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.is_provider_member(p_provider_id) or private.has_role('admin')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query select * from private.partner_balance(p_provider_id);
end;
$$;

create function public.admin_partner_balances()
returns table (provider_id uuid, display_name text, collected_minor bigint, refunded_minor bigint,
  pending_refunds_minor bigint, held_minor bigint, paid_out_minor bigint, owed_minor bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_role('admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select pr.id, pr.display_name, b.*
    from public.providers pr
    cross join lateral private.partner_balance(pr.id) b
    where exists (select 1 from public.payments p where p.provider_id = pr.id)
       or exists (select 1 from public.partner_payouts o where o.provider_id = pr.id)
    order by b.owed_minor desc, pr.display_name;
end;
$$;

create function public.record_partner_payout(p_provider_id uuid, p_amount_minor bigint, p_reference text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owed bigint;
  v_id uuid;
begin
  if not private.has_role('admin') then
    raise exception 'only admins record payouts' using errcode = '42501';
  end if;
  perform 1 from public.providers pr where pr.id = p_provider_id for update;
  if not found then
    raise exception 'partner not found' using errcode = 'P0002';
  end if;
  select b.owed_minor into v_owed from private.partner_balance(p_provider_id) b;
  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > v_owed then
    raise exception 'the payout must be between ₹0.01 and the amount owed' using errcode = '22023';
  end if;
  if exists (select 1 from public.partner_payouts o where o.provider_id = p_provider_id and o.reference = btrim(p_reference)) then
    raise exception 'this bank reference is already recorded' using errcode = '23505';
  end if;
  insert into public.partner_payouts (provider_id, amount_minor, reference, note, created_by)
  values (p_provider_id, p_amount_minor, btrim(p_reference), btrim(coalesce(p_note, '')), (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.queue_refund(uuid, bigint, text) from public, anon, authenticated;
revoke all on function private.refund_on_cancellation() from public, anon, authenticated;
revoke all on function private.cancel_unpaid_bookings() from public, anon, authenticated;

revoke all on function public.set_deposits_required(boolean) from public, anon;
revoke all on function public.deposit_checkout(uuid) from public, anon;
revoke all on function public.partner_payment_summary(uuid) from public, anon;
revoke all on function public.admin_partner_balances() from public, anon;
revoke all on function public.record_partner_payout(uuid, bigint, text, text) from public, anon;
grant execute on function public.set_deposits_required(boolean) to authenticated;
grant execute on function public.deposit_checkout(uuid) to authenticated;
grant execute on function public.partner_payment_summary(uuid) to authenticated;
grant execute on function public.admin_partner_balances() to authenticated;
grant execute on function public.record_partner_payout(uuid, bigint, text, text) to authenticated;

-- System path only: the Razorpay webhook route and server-side reconciliation.
revoke all on function public.record_razorpay_payment(text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.record_razorpay_refund(text, uuid, text, text, text, bigint) from public, anon, authenticated;
revoke all on function public.attach_deposit_order(uuid, uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.refunds_to_check(integer) from public, anon, authenticated;
revoke all on function public.claim_refunds(integer, uuid) from public, anon, authenticated;
revoke all on function public.payments_to_reconcile(integer) from public, anon, authenticated;
revoke all on function public.log_payment_event(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.finish_payment_event(text, text) from public, anon, authenticated;
grant execute on function public.record_razorpay_payment(text, text, text, bigint, text) to service_role;
grant execute on function public.record_razorpay_refund(text, uuid, text, text, text, bigint) to service_role;
grant execute on function public.attach_deposit_order(uuid, uuid, text, bigint) to service_role;
grant execute on function public.refunds_to_check(integer) to service_role;
grant execute on function public.claim_refunds(integer, uuid) to service_role;
grant execute on function public.payments_to_reconcile(integer) to service_role;
grant execute on function public.log_payment_event(text, text, jsonb) to service_role;
grant execute on function public.finish_payment_event(text, text) to service_role;
