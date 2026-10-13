import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getUserContext } from "@/lib/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function CustomPageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const context = await getUserContext();
  const supabase = await createSupabaseServerClient();
  const { data: page } = await supabase
    .from("custom_pages")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!page) notFound();

  const { data: files } = await supabase
    .from("custom_page_files")
    .select("*")
    .eq("page_id", page.id)
    .order("created_at", { ascending: true });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/seiten"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Alle Teamseiten
      </Link>

      <PageHeader
        title={page.title}
        eyebrow="Teamseite"
        action={
          !page.published && context.roles.includes("admin") ? (
            <Badge>Entwurf · nur für Admins sichtbar</Badge>
          ) : undefined
        }
      />

      {page.summary ? (
        <p className="text-lg leading-7 text-muted-foreground">
          {page.summary}
        </p>
      ) : null}

      {page.content ? (
        <Card className="p-5 sm:p-7">
          <div className="whitespace-pre-wrap text-sm leading-7 sm:text-base">
            {page.content}
          </div>
        </Card>
      ) : null}

      {(files ?? []).length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">PDF-Dateien</h2>
          <div className="grid gap-3">
            {(files ?? []).map((file) => (
              <a
                key={file.id}
                href={`/api/pages/files/${file.id}/download`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:bg-muted/40"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="rounded-md bg-primary/10 p-2 text-primary">
                    <FileText className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {file.file_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      PDF · {fileSize(file.file_size)}
                    </span>
                  </span>
                </span>
                <Download className="h-5 w-5 shrink-0 text-muted-foreground" />
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
