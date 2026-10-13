"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpenText,
  Eye,
  EyeOff,
  FilePlus2,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { SettingsSectionNav } from "@/components/settings-page";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Input,
  Label,
  Notice,
  PageHeader,
  Textarea,
} from "@/components/ui";
import type { AppRoleDefinition } from "@/lib/auth";
import {
  CUSTOM_PAGE_FILE_BUCKET,
  CUSTOM_PAGE_FILE_MAX_BYTES,
  customPageSlug,
  isPdfFile,
} from "@/lib/custom-pages";
import type { Database } from "@/lib/database.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type CustomPage = Database["public"]["Tables"]["custom_pages"]["Row"];
type CustomPageFile =
  Database["public"]["Tables"]["custom_page_files"]["Row"];

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function CustomPagesSettingsPage({
  initialPages,
  initialFiles,
  roleDefinitions,
}: {
  initialPages: CustomPage[];
  initialFiles: CustomPageFile[];
  roleDefinitions: AppRoleDefinition[];
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [pages, setPages] = useState(initialPages);
  const [files, setFiles] = useState(initialFiles);
  const [editing, setEditing] = useState<CustomPage | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [visibleToRoles, setVisibleToRoles] = useState<string[]>([]);
  const [published, setPublished] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomPage | null>(null);

  const roleLabelByKey = useMemo(
    () => new Map(roleDefinitions.map((role) => [role.key, role.label])),
    [roleDefinitions],
  );

  function resetForm() {
    setEditing(null);
    setTitle("");
    setSlug("");
    setSlugTouched(false);
    setSummary("");
    setContent("");
    setVisibleToRoles([]);
    setPublished(true);
    setSortOrder(0);
    setPendingFiles([]);
  }

  function openCreate() {
    resetForm();
    setMessage(null);
    setSuccess(null);
    setShowForm(true);
  }

  function openEdit(page: CustomPage) {
    setEditing(page);
    setTitle(page.title);
    setSlug(page.slug);
    setSlugTouched(true);
    setSummary(page.summary ?? "");
    setContent(page.content);
    setVisibleToRoles(page.visible_to_roles);
    setPublished(page.published);
    setSortOrder(page.sort_order);
    setPendingFiles([]);
    setMessage(null);
    setSuccess(null);
    setShowForm(true);
  }

  function closeForm() {
    resetForm();
    setShowForm(false);
  }

  function updateTitle(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(customPageSlug(value));
  }

  function toggleRole(role: string) {
    setVisibleToRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role],
    );
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    const invalid = nextFiles.find((file) => !isPdfFile(file));
    if (invalid) {
      setMessage("Bitte ausschließlich PDF-Dateien auswählen.");
      return;
    }
    const oversized = nextFiles.find(
      (file) => file.size > CUSTOM_PAGE_FILE_MAX_BYTES,
    );
    if (oversized) {
      setMessage("Eine PDF-Datei darf maximal 20 MB groß sein.");
      return;
    }
    setPendingFiles((current) => [...current, ...nextFiles]);
    setMessage(null);
  }

  async function uploadPdf(pageId: string, file: File) {
    const filePath = `${pageId}/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from(CUSTOM_PAGE_FILE_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase
      .from("custom_page_files")
      .insert({
        page_id: pageId,
        file_name: file.name.slice(0, 240),
        file_path: filePath,
        file_size: file.size,
        mime_type: "application/pdf",
      })
      .select("*")
      .single();
    if (error || !data) {
      await supabase.storage.from(CUSTOM_PAGE_FILE_BUCKET).remove([filePath]);
      throw error ?? new Error("PDF konnte nicht gespeichert werden.");
    }
    return data;
  }

  async function savePage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    if (!title.trim() || customPageSlug(slug).length < 2) {
      setMessage("Titel und eine gültige URL sind erforderlich.");
      return;
    }

    setLoading(true);
    setMessage(null);
    setSuccess(null);
    const response = await fetch(
      editing ? `/api/admin/pages/${editing.id}` : "/api/admin/pages",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          summary,
          content,
          visible_to_roles: visibleToRoles,
          published,
          sort_order: sortOrder,
        }),
      },
    );
    const data = (await response.json().catch(() => ({}))) as {
      page?: CustomPage;
      error?: string;
    };

    if (!response.ok || !data.page) {
      setLoading(false);
      setMessage(data.error ?? "Seite konnte nicht gespeichert werden.");
      return;
    }

    try {
      const uploadedFiles: CustomPageFile[] = [];
      for (const file of pendingFiles) {
        uploadedFiles.push(await uploadPdf(data.page.id, file));
      }
      setFiles((current) => [...current, ...uploadedFiles]);
      setPages((current) =>
        [data.page!, ...current.filter((page) => page.id !== data.page!.id)].sort(
          (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title),
        ),
      );
      closeForm();
      setSuccess(
        editing
          ? "Die Teamseite wurde gespeichert."
          : "Die Teamseite wurde angelegt.",
      );
      router.refresh();
    } catch (error) {
      setEditing(data.page);
      setPendingFiles([]);
      setMessage(
        `Die Seite wurde gespeichert, aber mindestens eine PDF-Datei konnte nicht hochgeladen werden: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`,
      );
    } finally {
      setLoading(false);
    }
  }

  async function removeFile(file: CustomPageFile) {
    if (loading) return;
    setLoading(true);
    setMessage(null);
    const response = await fetch(`/api/admin/pages/files/${file.id}`, {
      method: "DELETE",
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setLoading(false);
    if (!response.ok) {
      setMessage(data.error ?? "PDF konnte nicht gelöscht werden.");
      return;
    }
    setFiles((current) => current.filter((item) => item.id !== file.id));
  }

  async function deletePage() {
    if (!deleteTarget || loading) return;
    setLoading(true);
    setMessage(null);
    const response = await fetch(`/api/admin/pages/${deleteTarget.id}`, {
      method: "DELETE",
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setLoading(false);
    if (!response.ok) {
      setMessage(data.error ?? "Seite konnte nicht gelöscht werden.");
      return;
    }
    setPages((current) =>
      current.filter((page) => page.id !== deleteTarget.id),
    );
    setFiles((current) =>
      current.filter((file) => file.page_id !== deleteTarget.id),
    );
    setSuccess(`Die Seite „${deleteTarget.title}“ wurde gelöscht.`);
    setDeleteTarget(null);
    router.refresh();
  }

  const editingFiles = editing
    ? files.filter((file) => file.page_id === editing.id)
    : [];

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Einstellungen"
        eyebrow="Admin · Teamseiten"
        action={<SettingsSectionNav isAdmin />}
      />

      {message ? <Notice tone="danger">{message}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}

      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Neue Teamseite
        </Button>
      </div>

      {showForm ? (
        <Card className="p-5">
          <form onSubmit={savePage} className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BookOpenText className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">
                  {editing ? "Teamseite bearbeiten" : "Neue Teamseite"}
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Editor schließen"
                onClick={closeForm}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <Label htmlFor="page-title">Titel</Label>
                <Input
                  id="page-title"
                  value={title}
                  onChange={(event) => updateTitle(event.target.value)}
                  placeholder="z. B. Dienstpläne"
                  required
                />
              </Field>
              <Field>
                <Label htmlFor="page-slug">URL</Label>
                <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring/30">
                  <span className="pl-3 text-sm text-muted-foreground">
                    /seiten/
                  </span>
                  <Input
                    id="page-slug"
                    value={slug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      setSlug(customPageSlug(event.target.value));
                    }}
                    className="border-0 pl-0 focus-visible:ring-0"
                    required
                  />
                </div>
              </Field>
            </div>

            <Field>
              <Label htmlFor="page-summary">Kurzbeschreibung</Label>
              <Input
                id="page-summary"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                maxLength={500}
                placeholder="Kurze Erklärung für die Seitenübersicht"
              />
            </Field>

            <Field>
              <Label htmlFor="page-content">Seiteninhalt</Label>
              <Textarea
                id="page-content"
                rows={12}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Hinweise, Ansprechpartner:innen und weitere Informationen …"
              />
            </Field>

            <div className="space-y-3 rounded-md border border-border p-4">
              <div>
                <Label>Sichtbar für</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ohne Auswahl ist die Seite für alle angemeldeten Personen
                  sichtbar. Admins können alle Seiten sehen.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setVisibleToRoles([])}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm transition",
                    visibleToRoles.length === 0
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted",
                  )}
                >
                  Alle Rollen
                </button>
                {roleDefinitions.map((role) => (
                  <button
                    key={role.key}
                    type="button"
                    onClick={() => toggleRole(role.key)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm transition",
                      visibleToRoles.includes(role.key)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {role.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <Label htmlFor="page-sort-order">Reihenfolge</Label>
                <Input
                  id="page-sort-order"
                  type="number"
                  value={sortOrder}
                  onChange={(event) => setSortOrder(Number(event.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Kleinere Zahlen stehen in der Navigation weiter oben.
                </p>
              </Field>
              <label className="flex items-center gap-3 self-start rounded-md border border-border p-4 text-sm font-medium sm:mt-6">
                <input
                  type="checkbox"
                  checked={published}
                  onChange={(event) => setPublished(event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Seite veröffentlichen
              </label>
            </div>

            <div className="space-y-3 rounded-md border border-border p-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <div>
                  <Label htmlFor="page-pdfs">PDF-Dateien</Label>
                  <p className="text-xs text-muted-foreground">
                    Zum Beispiel Dienstpläne; maximal 20 MB je Datei.
                  </p>
                </div>
              </div>
              <Input
                id="page-pdfs"
                type="file"
                accept="application/pdf,.pdf"
                multiple
                onChange={selectFiles}
              />
              {editingFiles.length > 0 ? (
                <div className="space-y-2">
                  {editingFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        {file.file_name} · {fileSize(file.file_size)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="PDF entfernen"
                        onClick={() => removeFile(file)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
              {pendingFiles.length > 0 ? (
                <div className="space-y-2">
                  {pendingFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${file.size}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-dashed border-primary/50 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        {file.name} · {fileSize(file.size)} · wird hochgeladen
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Auswahl entfernen"
                        onClick={() =>
                          setPendingFiles((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Seite speichern
              </Button>
              <Button type="button" variant="ghost" onClick={closeForm}>
                Abbrechen
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {pages.map((page) => {
          const pageFiles = files.filter((file) => file.page_id === page.id);
          return (
            <Card key={page.id} className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{page.title}</h2>
                    <Badge tone={page.published ? "success" : "neutral"}>
                      {page.published ? (
                        <Eye className="h-3 w-3" />
                      ) : (
                        <EyeOff className="h-3 w-3" />
                      )}
                      {page.published ? "Veröffentlicht" : "Entwurf"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    /seiten/{page.slug}
                  </p>
                  {page.summary ? (
                    <p className="mt-3 text-sm">{page.summary}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge>
                      {page.visible_to_roles.length === 0
                        ? "Alle Rollen"
                        : page.visible_to_roles
                            .map((role) => roleLabelByKey.get(role) ?? role)
                            .join(", ")}
                    </Badge>
                    {pageFiles.length > 0 ? (
                      <Badge>
                        <FilePlus2 className="h-3 w-3" />
                        {pageFiles.length} PDF
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Link
                    href={`/seiten/${page.slug}`}
                    title="Seite öffnen"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent transition hover:bg-muted"
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Seite bearbeiten"
                    onClick={() => openEdit(page)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Seite löschen"
                    onClick={() => setDeleteTarget(page)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
        {pages.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Noch keine Teamseiten angelegt.
          </Card>
        ) : null}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Teamseite löschen?"
        description="Die Seite und alle zugehörigen PDF-Dateien werden dauerhaft gelöscht."
        detail={deleteTarget?.title}
        confirmLabel={loading ? "Wird gelöscht …" : "Seite löschen"}
        onCancel={() => {
          if (!loading) setDeleteTarget(null);
        }}
        onConfirm={deletePage}
      />
    </div>
  );
}
