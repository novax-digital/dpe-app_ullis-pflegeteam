import Link from "next/link";
import { BookOpenText, ChevronRight, FileText } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getUserContext } from "@/lib/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CustomPagesIndexRoute() {
  const context = await getUserContext();
  const supabase = await createSupabaseServerClient();
  const { data: pages } = await supabase
    .from("custom_pages")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });

  return (
    <div className="space-y-6">
      <PageHeader title="Teamseiten" eyebrow="Informationen und Dienstpläne" />

      <div className="grid gap-4 md:grid-cols-2">
        {(pages ?? []).map((page) => (
          <Link key={page.id} href={`/seiten/${page.slug}`} className="group">
            <Card className="h-full p-5 transition group-hover:border-primary/40 group-hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <BookOpenText className="h-5 w-5 text-primary" />
                    <h2 className="font-semibold">{page.title}</h2>
                    {!page.published && context.roles.includes("admin") ? (
                      <Badge>Entwurf</Badge>
                    ) : null}
                  </div>
                  {page.summary ? (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {page.summary}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Seite öffnen
                    </p>
                  )}
                </div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {(pages ?? []).length === 0 ? (
        <Card className="p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Für deine Rolle sind aktuell keine Teamseiten freigegeben.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
