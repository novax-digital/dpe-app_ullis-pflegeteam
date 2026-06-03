import { HealthCoursesPage } from "@/components/health-courses-page";
import { getUserContext } from "@/lib/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HealthCoursesRoute() {
  const context = await getUserContext();
  const supabase = await createSupabaseServerClient();

  const [coursesResult, registrationsResult, profilesResult] =
    await Promise.all([
      supabase
        .from("health_courses")
        .select("*")
        .order("start_time", { ascending: true }),
      supabase.from("course_registrations").select("*"),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

  return (
    <HealthCoursesPage
      initialCourses={coursesResult.data ?? []}
      initialRegistrations={registrationsResult.data ?? []}
      initialProfiles={profilesResult.data ?? []}
      userId={context.user!.id}
      roles={context.roles}
    />
  );
}
