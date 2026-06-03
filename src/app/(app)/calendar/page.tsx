import { CalendarPage } from "@/components/calendar-page";
import { getUserContext } from "@/lib/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CalendarRoute() {
  const context = await getUserContext();
  const supabase = await createSupabaseServerClient();

  const [eventsResult, coursesResult] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("*")
      .order("start_time", { ascending: true }),
    supabase
      .from("health_courses")
      .select("id, title, description, location, start_time, end_time, status")
      .order("start_time", { ascending: true }),
  ]);

  return (
    <CalendarPage
      initialCalendarEvents={eventsResult.data ?? []}
      initialCourses={coursesResult.data ?? []}
      userId={context.user!.id}
      isAdmin={context.roles.includes("admin")}
      initialMonth={new Date().toISOString()}
    />
  );
}
