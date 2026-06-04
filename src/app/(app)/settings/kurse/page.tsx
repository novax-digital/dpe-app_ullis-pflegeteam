import { AccessDenied } from "@/components/access-denied";
import { SettingsPage } from "@/components/settings-page";
import { getUserContext } from "@/lib/auth-server";
import {
  normalizeHealthCourseSettings,
  type HealthCourseSettings,
} from "@/lib/health-course-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsCoursesRoute() {
  const { profile, roles } = await getUserContext();

  if (!roles.includes("admin")) {
    return <AccessDenied />;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("health_course_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  const healthCourseSettings: HealthCourseSettings =
    normalizeHealthCourseSettings(data);

  return (
    <SettingsPage
      mode="courses"
      profile={profile}
      isAdmin
      initialHealthCourseSettings={healthCourseSettings}
    />
  );
}
