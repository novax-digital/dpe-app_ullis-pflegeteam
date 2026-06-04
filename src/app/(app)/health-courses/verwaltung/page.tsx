import { AccessDenied } from "@/components/access-denied";
import { HealthCoursesPage } from "@/components/health-courses-page";
import { hasAllowedRole } from "@/lib/auth";
import { getUserContext } from "@/lib/auth-server";
import { normalizeHealthCourseSettings } from "@/lib/health-course-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HealthCoursesManagementRoute() {
  const context = await getUserContext();

  if (!context.user || !hasAllowedRole(context.roles, ["admin", "physiotherapy"])) {
    return <AccessDenied />;
  }

  const supabase = await createSupabaseServerClient();
  const [coursesResult, registrationsResult, profilesResult, settingsResult] =
    await Promise.all([
      supabase
        .from("health_courses")
        .select("*")
        .order("start_time", { ascending: true }),
      supabase.from("course_registrations").select("*"),
      supabase.from("profiles").select("id, full_name, email"),
      supabase
        .from("health_course_settings")
        .select("*")
        .eq("id", "default")
        .maybeSingle(),
    ]);

  return (
    <HealthCoursesPage
      mode="manage"
      initialCourses={coursesResult.data ?? []}
      initialRegistrations={registrationsResult.data ?? []}
      initialProfiles={profilesResult.data ?? []}
      initialCourseSettings={normalizeHealthCourseSettings(
        settingsResult.data,
      )}
      userId={context.user.id}
      roles={context.roles}
    />
  );
}
