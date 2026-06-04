import { AccessDenied } from "@/components/access-denied";
import { EBikeReservationsPage } from "@/components/e-bikes-page";
import { hasAllowedRole } from "@/lib/auth";
import { getUserContext } from "@/lib/auth-server";
import { normalizeEBikeAvailability } from "@/lib/e-bike-availability";
import { normalizeEBikeReservationSettings } from "@/lib/e-bike-reservation-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EBikeReservationsRoute({
  searchParams,
}: {
  searchParams: Promise<{ bike?: string | string[] }>;
}) {
  const context = await getUserContext();

  if (!context.user || !hasAllowedRole(context.roles, ["admin", "employee"])) {
    return <AccessDenied />;
  }

  const supabase = await createSupabaseServerClient();
  const isAdmin = context.roles.includes("admin");
  const params = await searchParams;
  const bikeParam = Array.isArray(params.bike) ? params.bike[0] : params.bike;
  const [
    bikesResult,
    reservationsResult,
    profilesResult,
    availabilityResult,
    reservationSettingsResult,
  ] = await Promise.all([
    supabase.from("ebikes").select("*").order("name"),
    supabase
      .from("ebike_reservations")
      .select("*")
      .order("start_time", { ascending: true }),
    isAdmin
      ? supabase.from("profiles").select("id, full_name, email")
      : Promise.resolve({ data: [] }),
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
  const bikes = bikesResult.data ?? [];
  const initialSelectedBikeId = bikes.some((bike) => bike.id === bikeParam)
    ? bikeParam
    : undefined;

  return (
    <EBikeReservationsPage
      initialBikes={bikes}
      initialReservations={reservationsResult.data ?? []}
      initialProfiles={profilesResult.data ?? []}
      initialAvailability={normalizeEBikeAvailability(
        availabilityResult.data ?? [],
      )}
      initialReservationSettings={normalizeEBikeReservationSettings(
        reservationSettingsResult.data,
      )}
      initialSelectedBikeId={initialSelectedBikeId}
      isAdmin={isAdmin}
      userId={context.user.id}
    />
  );
}
