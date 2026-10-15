import "server-only";

import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * In-app booking alerts (migration booking_alerts). Alerts are a convenience:
 * if they can't be read, the pages still work, so failures are logged and
 * treated as "nothing new" rather than breaking navigation.
 */

/** The signed-in traveller's bookings changed by a partner or the system since they last looked. */
export async function getMyBookingUpdates(): Promise<ReadonlySet<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_booking_updates");
  if (error) {
    logger.error("bookings.alerts_failed", { code: error.code });
    return new Set();
  }
  return new Set(data.map((row) => row.booking_id));
}

/** Records that the traveller has seen their bookings (clears the updates). */
export async function markBookingsSeen(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_bookings_seen");
  if (error) logger.error("bookings.mark_seen_failed", { code: error.code });
}

export type PartnerAlerts = { needsResponse: number; expiringSoon: number };

/** Requests waiting for the signed-in partner's businesses, and those due within 12 hours. */
export async function getPartnerAlerts(): Promise<PartnerAlerts> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("partner_booking_alerts").single();
  if (error) {
    logger.error("bookings.partner_alerts_failed", { code: error.code });
    return { needsResponse: 0, expiringSoon: 0 };
  }
  return { needsResponse: data.needs_response, expiringSoon: data.expiring_soon };
}
