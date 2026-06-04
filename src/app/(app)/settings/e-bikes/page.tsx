import { AccessDenied } from "@/components/access-denied";
import { SettingsPage } from "@/components/settings-page";
import { getUserContext } from "@/lib/auth-server";
import {
  normalizeEBikeAvailability,
  type EBikeAvailabilityWindow,
} from "@/lib/e-bike-availability";
import {
  normalizeEBikeReservationSettings,
  type EBikeReservationSettings,
} from "@/lib/e-bike-reservation-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsEBikesRoute() {
  const { profile, roles } = await getUserContext();

  if (!roles.includes("admin")) {
    return <AccessDenied />;
  }

  const supabase = await createSupabaseServerClient();
  const [availabilityResult, reservationSettingsResult] = await Promise.all([
    supabase
      .from("ebike_availability_windows")
      .select("*")
      .order("day_of_week"),
    supabase
      .from("ebike_reservation_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle(),
  ]);
  const ebikeAvailability: EBikeAvailabilityWindow[] =
    normalizeEBikeAvailability(availabilityResult.data ?? []);
  const ebikeReservationSettings: EBikeReservationSettings =
    normalizeEBikeReservationSettings(reservationSettingsResult.data);

  return (
    <SettingsPage
      mode="e-bikes"
      profile={profile}
      isAdmin
      initialEBikeAvailability={ebikeAvailability}
      initialEBikeReservationSettings={ebikeReservationSettings}
    />
  );
}
