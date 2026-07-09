import { AccessDenied } from "@/components/access-denied";
import { SettingsPage } from "@/components/settings-page";
import {
  normalizeCalendarSettings,
  type CalendarSettings,
} from "@/lib/calendar-settings";
import { getUserContext } from "@/lib/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsCalendarRoute() {
  const { roles } = await getUserContext();

  if (!roles.includes("admin")) {
    return <AccessDenied />;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("calendar_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  const calendarSettings: CalendarSettings = normalizeCalendarSettings(data);

  return (
    <SettingsPage
      mode="calendar"
      isAdmin
      initialCalendarSettings={calendarSettings}
    />
  );
}
