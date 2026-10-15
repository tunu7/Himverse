import "server-only";

import { AppError } from "@/lib/errors";
import { type BookingStatus, istDate } from "@/lib/booking-options";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { toAppError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth/session";

// Bookings are read as the signed-in user (RLS: travelers see their own,
// provider members see their provider's) and written only through the booking
// RPCs, which derive provider, price and status server-side (ADR-0004).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type DbError = { code?: string | null; message?: string | null };

/**
 * Maps errors raised by the booking functions. Their messages for 55000/22023
 * are written by us in the migration, so they're safe and useful to show.
 */
function bookingError(error: DbError, fallback: string): AppError {
  const message = error.message
    ? error.message.charAt(0).toUpperCase() + error.message.slice(1) + "."
    : fallback;
  switch (error.code) {
    case "23505":
      return new AppError("CONFLICT", "You already have an active booking for this date.", {
        cause: error,
      });
    case "55000":
      return new AppError("CONFLICT", message, { cause: error });
    case "54000":
      return new AppError("RATE_LIMITED", message, { cause: error });
    case "22023":
      return new AppError("VALIDATION_FAILED", message, { cause: error });
    case "P0002":
      return new AppError("NOT_FOUND", "We couldn't find that booking or date.", { cause: error });
    case "42501":
      return new AppError("FORBIDDEN", message, { cause: error });
    default:
      return toAppError(error, fallback);
  }
}

export type OpenSlot = {
  id: string;
  startsOn: string;
  startTime: string | null;
  seatsLeft: number;
};

/** Open, upcoming dates for a public experience (anonymous client: RLS-public only). */
export async function listOpenSlots(experienceId: string): Promise<OpenSlot[]> {
  const { data, error } = await createSupabasePublicClient()
    .from("availability_slots")
    .select("id, starts_on, start_time, capacity, seats_confirmed")
    .eq("experience_id", experienceId)
    .order("starts_on")
    .order("start_time", { nullsFirst: true })
    .limit(60);
  if (error) throw toAppError(error, "Could not load available dates.");
  return data.map((s) => ({
    id: s.id,
    startsOn: s.starts_on,
    startTime: s.start_time,
    seatsLeft: Math.max(0, s.capacity - s.seats_confirmed),
  }));
}

export type BookingRequestInput = {
  adults: number;
  children: number;
  contactPhone: string;
  note: string;
  idempotencyKey: string;
};

export type DateBookingRequestInput = BookingRequestInput & {
  experienceId: string;
  date: string;
};

/**
 * Requests a bookable experience for any future date. The database uses an
 * open published slot on that date when there is one (seat limits apply);
 * otherwise the provider's confirmation is the availability check (ADR-0004).
 */
export async function requestBookingOnDate(
  input: DateBookingRequestInput,
): Promise<{ bookingId: string; reference: string; replayed: boolean }> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("request_booking_on_date", {
    p_experience_id: input.experienceId,
    p_date: input.date,
    p_adults: input.adults,
    p_children: input.children,
    p_contact_phone: input.contactPhone,
    p_note: input.note,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw bookingError(error, "Could not request this booking.");
  const row = data[0];
  if (!row) throw new AppError("INTERNAL", "Could not request this booking.");
  return { bookingId: row.booking_id, reference: row.booking_reference, replayed: row.replayed };
}

export type ListingBookingRequestInput = BookingRequestInput & {
  experienceId: string;
  startsOn: string;
  /** Last service day (a stay's last night). */
  endsOn: string;
  units: number;
  pickupNote: string;
};

/** Requests a guide, stay or transport listing for a date range (ADR-0008). */
export async function requestListingBooking(
  input: ListingBookingRequestInput,
): Promise<{ bookingId: string; reference: string; replayed: boolean }> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("request_listing_booking", {
    p_experience_id: input.experienceId,
    p_starts_on: input.startsOn,
    p_ends_on: input.endsOn,
    p_units: input.units,
    p_adults: input.adults,
    p_children: input.children,
    p_contact_phone: input.contactPhone,
    p_note: input.note,
    p_pickup_note: input.pickupNote,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw bookingError(error, "Could not request this booking.");
  const row = data[0];
  if (!row) throw new AppError("INTERNAL", "Could not request this booking.");
  return { bookingId: row.booking_id, reference: row.booking_reference, replayed: row.replayed };
}

export type TripBookingItemResult = {
  itemId: string;
  /** Present when a request exists (new or replayed). */
  booking: { id: string; reference: string; status: BookingStatus } | null;
  /** Database-written reason when the item couldn't be requested. */
  error: string | null;
  alreadyRequested: boolean;
};

/**
 * Requests every item of an itinerary version on its planned day. Party and
 * dates come from the stored version; each item succeeds or fails on its own.
 */
export async function requestItineraryBookings(input: {
  versionId: string;
  contactPhone: string;
  note: string;
  idempotencyKey: string;
}): Promise<TripBookingItemResult[]> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("request_itinerary_bookings", {
    p_version_id: input.versionId,
    p_contact_phone: input.contactPhone,
    p_note: input.note,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw bookingError(error, "Could not request bookings for this trip.");
  return data.map((row) => ({
    itemId: row.item_id,
    booking:
      row.booking_id && row.booking_reference && row.booking_status
        ? { id: row.booking_id, reference: row.booking_reference, status: row.booking_status }
        : null,
    error: row.error_message ? sentence(row.error_message) : null,
    alreadyRequested: row.error_code === "23505",
  }));
}

function sentence(message: string): string {
  return message.charAt(0).toUpperCase() + message.slice(1) + ".";
}

export async function respondToBooking(
  bookingId: string,
  decision: "confirmed" | "declined",
  finalTotalMinor: number | null,
  note: string,
): Promise<void> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("respond_to_booking", {
    p_booking_id: bookingId,
    p_decision: decision,
    // Nullable in SQL (required only when confirming); generated types mark it non-null.
    p_final_total_minor: finalTotalMinor as number,
    p_note: note,
  });
  if (error) throw bookingError(error, "Could not update this booking.");
}

export async function cancelBooking(bookingId: string, reason: string): Promise<void> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
    p_reason: reason,
  });
  if (error) throw bookingError(error, "Could not cancel this booking.");
}

export type BookingSummary = {
  id: string;
  reference: string;
  status: BookingStatus;
  experienceTitle: string;
  experienceId: string;
  slotStartsOn: string;
  slotStartTime: string | null;
  /** Last service day for multi-day guides, stays (last night) and day hire. */
  endsOn: string | null;
  /** Rooms, vehicles or guides. */
  units: number;
  partySize: number;
  estimatedTotalMinor: number | null;
  confirmedTotalMinor: number | null;
  requestExpiresAt: string;
  createdAt: string;
};

const SUMMARY_COLUMNS =
  "id, reference, status, experience_title, experience_id, slot_starts_on, slot_start_time, ends_on, units, party_size, estimated_total_minor, confirmed_total_minor, request_expires_at, created_at";

type SummaryRow = {
  id: string;
  reference: string;
  status: BookingStatus;
  experience_title: string;
  experience_id: string;
  slot_starts_on: string;
  slot_start_time: string | null;
  ends_on: string | null;
  units: number;
  // Generated column (adults + children, both NOT NULL); typed nullable by the generator.
  party_size: number | null;
  estimated_total_minor: number | null;
  confirmed_total_minor: number | null;
  request_expires_at: string;
  created_at: string;
};

function toSummary(row: SummaryRow): BookingSummary {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    experienceTitle: row.experience_title,
    experienceId: row.experience_id,
    slotStartsOn: row.slot_starts_on,
    slotStartTime: row.slot_start_time,
    endsOn: row.ends_on,
    units: row.units,
    partySize: row.party_size ?? 0,
    estimatedTotalMinor: row.estimated_total_minor,
    confirmedTotalMinor: row.confirmed_total_minor,
    requestExpiresAt: row.request_expires_at,
    createdAt: row.created_at,
  };
}

/** The signed-in traveler's own bookings (not their provider's, if they also run one). */
export async function listMyBookings(): Promise<BookingSummary[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(SUMMARY_COLUMNS)
    .eq("traveler_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw toAppError(error, "Could not load your bookings.");
  return data.map(toSummary);
}

export type ProviderBooking = BookingSummary & {
  providerId: string;
  travelerName: string;
  contactPhone: string;
  travelerNote: string;
  adults: number;
  children: number;
};

/** Bookings from the last 30 days onwards for providers the caller belongs to, excluding their own trips. */
export async function listProviderBookings(): Promise<ProviderBooking[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  // Filter by membership explicitly: RLS also lets admins read every booking,
  // and this page is the provider's own inbox.
  const { data: memberships, error: membershipError } = await supabase
    .from("provider_members")
    .select("provider_id")
    .eq("user_id", user.id);
  if (membershipError) throw toAppError(membershipError, "Could not load bookings.");
  if (memberships.length === 0) return [];
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `${SUMMARY_COLUMNS}, provider_id, traveler_name, contact_phone, traveler_note, adults, children`,
    )
    .in(
      "provider_id",
      memberships.map((m) => m.provider_id),
    )
    .neq("traveler_id", user.id)
    // Old trips would otherwise fill the page (oldest first, capped).
    .gte("slot_starts_on", istDate(new Date(), -30))
    .order("slot_starts_on", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw toAppError(error, "Could not load bookings.");
  return data.map((row) => ({
    ...toSummary(row),
    providerId: row.provider_id,
    travelerName: row.traveler_name,
    contactPhone: row.contact_phone,
    travelerNote: row.traveler_note,
    adults: row.adults,
    children: row.children,
  }));
}

export type BookingDetail = BookingSummary & {
  pickupNote: string;
  adults: number;
  children: number;
  contactPhone: string;
  travelerNote: string;
  providerNote: string | null;
  cancellationReason: string | null;
  cancelledBy: string | null;
  isTraveler: boolean;
  events: Array<{
    fromStatus: BookingStatus | null;
    toStatus: BookingStatus;
    actor: string;
    note: string | null;
    at: string;
  }>;
};

/** A booking the caller may see (as its traveler or provider), or null. */
export async function getBooking(id: string): Promise<BookingDetail | null> {
  if (!UUID.test(id)) return null;
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `${SUMMARY_COLUMNS}, traveler_id, adults, children, contact_phone, traveler_note, pickup_note, provider_note, cancellation_reason, cancelled_by`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw toAppError(error, "Could not load this booking.");
  if (!data) return null;
  const { data: events, error: eventsError } = await supabase
    .from("booking_events")
    .select("from_status, to_status, actor_role, note, created_at")
    .eq("booking_id", id)
    .order("id");
  if (eventsError) throw toAppError(eventsError, "Could not load this booking.");
  return {
    ...toSummary(data),
    pickupNote: data.pickup_note,
    adults: data.adults,
    children: data.children,
    contactPhone: data.contact_phone,
    travelerNote: data.traveler_note,
    providerNote: data.provider_note,
    cancellationReason: data.cancellation_reason,
    cancelledBy: data.cancelled_by,
    isTraveler: data.traveler_id === user.id,
    events: events.map((e) => ({
      fromStatus: e.from_status,
      toStatus: e.to_status,
      actor: e.actor_role,
      note: e.note,
      at: e.created_at,
    })),
  };
}

// --- Provider slot management (RLS: members of the experience's provider) -----------

export type ProviderSlot = OpenSlot & {
  experienceId: string;
  capacity: number;
  status: "open" | "closed";
};

export async function listSlotsForExperiences(experienceIds: string[]): Promise<ProviderSlot[]> {
  if (experienceIds.length === 0) return [];
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("availability_slots")
    .select("id, experience_id, starts_on, start_time, capacity, seats_confirmed, status")
    .in("experience_id", experienceIds)
    .gte("starts_on", istDate(new Date()))
    .order("starts_on")
    .limit(500);
  if (error) throw toAppError(error, "Could not load dates.");
  return data.map((s) => ({
    id: s.id,
    experienceId: s.experience_id,
    startsOn: s.starts_on,
    startTime: s.start_time,
    capacity: s.capacity,
    status: s.status,
    seatsLeft: Math.max(0, s.capacity - s.seats_confirmed),
  }));
}

export async function createSlot(input: {
  experienceId: string;
  startsOn: string;
  startTime: string | null;
  capacity: number;
}): Promise<void> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("availability_slots").insert({
    experience_id: input.experienceId,
    starts_on: input.startsOn,
    start_time: input.startTime,
    capacity: input.capacity,
  });
  if (error) {
    if (error.code === "23505")
      throw new AppError("CONFLICT", "That date and time already exists.", { cause: error });
    throw toAppError(error, "Could not add this date.");
  }
}

export async function updateSlot(
  slotId: string,
  changes: { capacity?: number; status?: "open" | "closed" },
): Promise<void> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("availability_slots")
    .update(changes)
    .eq("id", slotId)
    .select("id");
  if (error) {
    if (error.code === "23514") {
      throw new AppError("CONFLICT", "Capacity can't be lower than the seats already confirmed.", {
        cause: error,
      });
    }
    throw toAppError(error, "Could not update this date.");
  }
  if (data.length !== 1) throw new AppError("NOT_FOUND", "We couldn't find that date.");
}
