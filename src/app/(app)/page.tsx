import { Bike, CalendarDays, HeartPulse, Newspaper, Users } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/auth";
import { getUserContext } from "@/lib/auth-server";
import type { Database } from "@/lib/database.types";
import { formatDateTime } from "@/lib/format";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { user, profile, primaryRole } = await getUserContext();
  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [
    bikesResult,
    coursesResult,
    employeesResult,
    newsResult,
    reservationsResult,
    registrationsResult,
  ] = await Promise.all([
    supabase
      .from("ebikes")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .not("status", "in", "(maintenance,unavailable,in_use)"),
    supabase
      .from("health_courses")
      .select("id", { count: "exact", head: true })
      .gte("start_time", now.toISOString())
      .lte("start_time", in14Days.toISOString())
      .neq("status", "cancelled"),
    primaryRole === "admin"
      ? supabase.from("profiles").select("id", { count: "exact", head: true })
      : Promise.resolve({ count: null }),
    supabase
      .from("news")
      .select("id, title, author_id, published, published_at, created_at")
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("ebike_reservations")
      .select("id, start_time, end_time, purpose")
      .eq("user_id", user!.id)
      .eq("status", "active")
      .gte("end_time", now.toISOString())
      .order("start_time", { ascending: true })
      .limit(3),
    supabase
      .from("course_registrations")
      .select("course_id, health_courses(id, title, start_time, end_time, location)")
      .eq("user_id", user!.id)
      .eq("status", "registered")
      .limit(8),
  ]);

  const myCourses =
    registrationsResult.data
      ?.map((row) => row.health_courses)
      .filter((course) => course && new Date(course.end_time) >= now)
      .sort(
        (a, b) =>
          new Date(a!.start_time).getTime() -
          new Date(b!.start_time).getTime(),
      )
      .slice(0, 3) ?? [];
  const newsAuthorIds = Array.from(
    new Set(newsResult.data?.map((item) => item.author_id) ?? []),
  );
  let newsProfiles: Pick<
    Database["public"]["Tables"]["profiles"]["Row"],
    "id" | "full_name" | "email"
  >[] = [];

  if (newsAuthorIds.length > 0) {
    try {
      const admin = createSupabaseAdminClient();
      const { data } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", newsAuthorIds);
      newsProfiles = data ?? [];
    } catch {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", newsAuthorIds);
      newsProfiles = data ?? [];
    }
  }
  const newsProfileById = new Map(newsProfiles.map((item) => [item.id, item]));

  const displayName =
    profile?.full_name?.trim() || profile?.email?.trim() || "willkommen";
  const heroTitle =
    profile?.full_name?.trim() || profile?.email?.trim()
      ? `Willkommen zurück, ${displayName}`
      : "Willkommen zurück";

  return (
    <div className="space-y-6">
      <section
        className="relative min-h-[300px] overflow-hidden rounded-lg border border-border bg-muted shadow-sm sm:min-h-[340px]"
        style={{
          backgroundImage: "url('/images/team-collage.png')",
          backgroundPosition: "center 45%",
          backgroundSize: "cover",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/65 to-white/5" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
          <div className="max-w-3xl space-y-3">
            <Badge tone="success">
              {primaryRole ? ROLE_LABEL[primaryRole] : "Team"}
            </Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
                {heroTitle}
              </h1>
              <p className="mt-2 text-base text-muted-foreground sm:text-lg">
                Hier ist dein heutiger Überblick in der Mitarbeiter-App von
                Ullis Pflegeteam.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="E-Bikes verfügbar"
          value={bikesResult.count ?? 0}
          icon={<Bike className="h-5 w-5" />}
        />
        <StatCard
          label="Kurse in 14 Tagen"
          value={coursesResult.count ?? 0}
          icon={<HeartPulse className="h-5 w-5" />}
        />
        <StatCard
          label="Mitarbeitende"
          value={employeesResult.count ?? "-"}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Aktuelle News"
          value={newsResult.data?.length ?? 0}
          icon={<Newspaper className="h-5 w-5" />}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Meine nächsten Termine</h2>
          </div>
          <div className="space-y-3">
            {reservationsResult.data?.map((reservation) => (
              <div
                key={reservation.id}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                <p className="font-medium">
                  E-Bike: {formatDateTime(reservation.start_time)}
                </p>
                <p className="text-muted-foreground">
                  bis {formatDateTime(reservation.end_time)}
                </p>
                {reservation.purpose ? (
                  <p className="mt-1 text-muted-foreground">
                    {reservation.purpose}
                  </p>
                ) : null}
              </div>
            ))}
            {myCourses?.map((course) => (
              <div
                key={course.id}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                <p className="font-medium">{course.title}</p>
                <p className="text-muted-foreground">
                  {formatDateTime(course.start_time)}
                  {course.location ? ` · ${course.location}` : ""}
                </p>
              </div>
            ))}
            {!reservationsResult.data?.length && !myCourses?.length ? (
              <p className="text-sm text-muted-foreground">
                Keine anstehenden Termine.
              </p>
            ) : null}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">News</h2>
          </div>
          <div className="space-y-3">
            {newsResult.data?.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{item.title}</p>
                  {primaryRole === "admin" ? (
                    <Badge tone={item.published ? "success" : "neutral"}>
                      {item.published ? "Live" : "Entwurf"}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-muted-foreground">
                  {newsProfileById.get(item.author_id)?.full_name?.trim() ||
                    newsProfileById.get(item.author_id)?.email?.trim() ||
                    "Unbekannter Autor"}{" "}
                  · {formatDateTime(item.published_at ?? item.created_at)}
                </p>
              </div>
            ))}
            {!newsResult.data?.length ? (
              <p className="text-sm text-muted-foreground">Keine News vorhanden.</p>
            ) : null}
          </div>
        </Card>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-muted text-primary">
        {icon}
      </div>
      <p className="text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </Card>
  );
}
