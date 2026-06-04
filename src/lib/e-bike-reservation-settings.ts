import type { Database } from "@/lib/database.types";

export type EBikeReservationSettings =
  Database["public"]["Tables"]["ebike_reservation_settings"]["Row"];

export const DEFAULT_EBIKE_SAFETY_CONFIRMATION_TEXT = `Bitte beachte bei jeder Nutzung des E-Bikes:

- Halte dich jederzeit an die Verkehrsregeln.
- Trage während der Fahrt einen Helm.
- Schließe das E-Bike bei Pausen und nach der Rückgabe sicher ab.
- Lade das E-Bike nach der Rückgabe immer wieder auf.

Mit deiner Bestätigung übernimmst du diese Hinweise für deine Reservierung.`;

export const DEFAULT_EBIKE_RESERVATION_SETTINGS: EBikeReservationSettings = {
  id: "default",
  safety_confirmation_enabled: true,
  safety_confirmation_text: DEFAULT_EBIKE_SAFETY_CONFIRMATION_TEXT,
  created_at: "",
  updated_at: "",
};

export function normalizeEBikeReservationSettings(
  row: EBikeReservationSettings | null | undefined,
) {
  return row ?? DEFAULT_EBIKE_RESERVATION_SETTINGS;
}

export function needsEBikeSafetyConfirmation(
  settings: EBikeReservationSettings,
) {
  return (
    settings.safety_confirmation_enabled &&
    settings.safety_confirmation_text.trim().length > 0
  );
}
