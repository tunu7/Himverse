"use client";

import { useEffect } from "react";

import { markBookingsSeenAction } from "../actions";

/**
 * Clears the traveller's "updated" alerts once the list has been shown. Runs
 * after render, so this visit still labels the updated bookings.
 */
export function MarkBookingsSeen() {
  useEffect(() => {
    void markBookingsSeenAction();
  }, []);
  return null;
}
