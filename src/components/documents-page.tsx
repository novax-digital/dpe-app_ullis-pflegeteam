"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CloudUpload,
  Download,
  ExternalLink,
  File,
  FileImage,
  FileText,
  Loader2,
  Maximize2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
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
import type { Database } from "@/lib/database.types";
import {
  DOCUMENT_FILE_ACCEPTED_TYPES,
  DOCUMENT_FILE_MAX_BYTES,
} from "@/lib/document-files";
import { formatDateTime } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type DocumentItem = Database["public"]["Tables"]["documents"]["Row"];

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileKind(item: Pick<DocumentItem, "mime_type">) {
  if (item.mime_type.startsWith("image/")) return "image";
  if (item.mime_type === "application/pdf") return "pdf";
  if (item.mime_type.includes("wordprocessingml") || item.mime_type.includes("msword")) {
    return "word";
  }
  if (item.mime_type.includes("spreadsheetml") || item.mime_type.includes("excel")) {
    return "excel";
  }
  if (
    item.mime_type.includes("presentationml") ||
    item.mime_type.includes("powerpoint")
  ) {
    return "powerpoint";
  }
  return "file";
}

function kindLabel(item: Pick<DocumentItem, "mime_type">) {
  const kind = fileKind(item);
  if (kind === "image") return "Bild";
  if (kind === "pdf") return "PDF";
  if (kind === "word") return "Word";
  if (kind === "excel") return "Excel";
  if (kind === "powerpoint") return "PowerPoint";
  return "Datei";
}

function documentDownloadUrl(item: Pick<DocumentItem, "id">) {
  return `/api/documents/${item.id}/download`;
}

function DocumentIcon({
  item,
  className,
}: {
  item: Pick<DocumentItem, "mime_type">;
  className?: string;
}) {
  const kind = fileKind(item);

  if (kind === "image") return <FileImage className={className} />;
  if (kind === "pdf") return <FileText className={className} />;

  return <File className={className} />;
}

export function DocumentsPage({
  initialDocuments,
  isAdmin,
  userId,
}: {
  initialDocuments: DocumentItem[];
  isAdmin: boolean;
  userId: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [documents, setDocuments] = useState(initialDocuments);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileDragActive, setFileDragActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [previewDocument, setPreviewDocument] = useState<DocumentItem | null>(
    null,
  );
  const [pendingDocumentRemoval, setPendingDocumentRemoval] =
    useState<DocumentItem | null>(null);

  const visibleDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return documents;

    return documents.filter((item) =>
      [item.title, item.description, item.file_name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    );
  }, [documents, search]);

  async function reload() {
    const { data } = await supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });
    setDocuments((data ?? []) as DocumentItem[]);
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setFile(null);
  }

  function closeForm() {
    resetForm();
    setShowForm(false);
  }

  function selectFile(nextFile: File | null) {
    setMessage(null);

    if (!nextFile) {
      setFile(null);
      return true;
    }

    if (!DOCUMENT_FILE_ACCEPTED_TYPES.includes(nextFile.type)) {
      setFile(null);
      setMessage(
        "Bitte PDF, Bilddatei, Word-, Excel-, PowerPoint- oder Textdatei auswählen.",
      );
      return false;
    }

    if (nextFile.size > DOCUMENT_FILE_MAX_BYTES) {
      setFile(null);
      setMessage("Die Datei darf maximal 20 MB groß sein.");
      return false;
    }

    setFile(nextFile);
    if (!title.trim()) {
      setTitle(nextFile.name.replace(/\.[^.]+$/, ""));
    }
    return true;
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;

    if (!selectFile(nextFile)) {
      event.target.value = "";
    }
  }

  function handleFileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setFileDragActive(false);
    selectFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function uploadDocumentFile(nextFile: File) {
    const formData = new FormData();
    formData.append("file", nextFile);

    const response = await fetch("/api/admin/document-files", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json().catch(() => ({}))) as {
      fileUrl?: string;
      filePath?: string;
      fileName?: string;
      fileSize?: number;
      mimeType?: string;
      error?: string;
    };

    if (!response.ok || !data.fileUrl || !data.filePath) {
      throw new Error(
        data.error ?? "Die Datei konnte nicht hochgeladen werden.",
      );
    }

    return {
      fileUrl: data.fileUrl,
      filePath: data.filePath,
      fileName: data.fileName ?? nextFile.name,
      fileSize: data.fileSize ?? nextFile.size,
      mimeType: data.mimeType ?? nextFile.type,
    };
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!title.trim()) {
      setMessage("Titel ist erforderlich.");
      return;
    }

    if (!file) {
      setMessage("Bitte eine Datei auswählen.");
      return;
    }

    setLoading(true);

    try {
      const uploadedFile = await uploadDocumentFile(file);
      const { error } = await supabase.from("documents").insert({
        title: title.trim(),
        description: description.trim() || null,
        file_url: uploadedFile.fileUrl,
        file_path: uploadedFile.filePath,
        file_name: uploadedFile.fileName ?? file.name,
        file_size: uploadedFile.fileSize ?? file.size,
        mime_type: uploadedFile.mimeType ?? file.type,
        uploaded_by: userId,
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      closeForm();
      await reload();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Das Dokument konnte nicht gespeichert werden.",
      );
    } finally {
      setLoading(false);
    }
  }

  function remove(item: DocumentItem) {
    setPendingDocumentRemoval(item);
  }

  async function confirmRemove() {
    const item = pendingDocumentRemoval;
    if (!item) return;
    setPendingDocumentRemoval(null);

    const { error } = await supabase.from("documents").delete().eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await reload();
  }

  useEffect(() => {
    if (!showForm) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showForm]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dokumente"
        eyebrow="Wissen & Nachlesen"
        action={
          isAdmin ? (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              Neues Dokument
            </Button>
          ) : undefined
        }
      />

      {message && !showForm ? <Notice tone="danger">{message}</Notice> : null}

      {isAdmin && showForm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !loading) {
              closeForm();
            }
          }}
        >
          <Card
            className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="document-upload-dialog-title"
          >
            <form onSubmit={save} className="space-y-4">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div>
                  <h2
                    id="document-upload-dialog-title"
                    className="font-semibold"
                  >
                    Neues Dokument
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Datei hochladen und im Team bereitstellen
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeForm}
                  disabled={loading}
                  title="Schließen"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {message ? <Notice tone="danger">{message}</Notice> : null}

              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <Label htmlFor="document-title">Titel</Label>
                  <Input
                    id="document-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <Label htmlFor="document-description">Beschreibung</Label>
                  <Textarea
                    id="document-description"
                    rows={3}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>
              </div>

              <Field>
                <Label htmlFor="document-file">Datei</Label>
                <Input
                  id="document-file"
                  type="file"
                  accept={DOCUMENT_FILE_ACCEPTED_TYPES.join(",")}
                  onChange={handleFileChange}
                  className="sr-only"
                />
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    setFileDragActive(true);
                  }}
                  onDragLeave={() => setFileDragActive(false)}
                  onDrop={handleFileDrop}
                  className={cn(
                    "grid min-w-0 gap-4 rounded-lg border border-dashed bg-muted/45 p-4 transition sm:grid-cols-[80px_minmax(0,1fr)_auto] sm:items-center",
                    fileDragActive
                      ? "border-primary bg-accent ring-2 ring-primary/15"
                      : "border-border",
                  )}
                >
                  <div className="flex h-20 w-20 items-center justify-center rounded-md border border-border bg-card text-primary">
                    {file ? (
                      <DocumentIcon
                        item={{ mime_type: file.type }}
                        className="h-8 w-8"
                      />
                    ) : (
                      <CloudUpload className="h-8 w-8" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {file ? file.name : "PDF, Bilder und Office-Dateien"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {file
                        ? formatFileSize(file.size)
                        : "PDF, JPG, PNG, WebP, GIF, DOC, DOCX, XLS, XLSX, PPT, PPTX oder TXT bis 20 MB"}
                    </p>
                  </div>
                  <label
                    htmlFor="document-file"
                    className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm transition hover:bg-white"
                  >
                    <CloudUpload className="h-4 w-4 text-primary" />
                    Auswählen
                  </label>
                </div>
              </Field>

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeForm}
                  disabled={loading}
                >
                  Abbrechen
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Hochladen
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      <Card className="p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Dokumente suchen"
            className="pl-9"
          />
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        {visibleDocuments.map((item) => (
          <Card key={item.id} className="min-w-0 overflow-hidden">
            <div className="grid min-w-0 gap-4 p-5 sm:grid-cols-[82px_minmax(0,1fr)]">
              <button
                type="button"
                onClick={() => setPreviewDocument(item)}
                className="group flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-primary"
                title="Vorschau öffnen"
              >
                {fileKind(item) === "image" ? (
                  <img
                    src={item.file_url}
                    alt={item.title}
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                ) : (
                  <DocumentIcon item={item} className="h-8 w-8" />
                )}
              </button>

              <div className="min-w-0 space-y-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-semibold">{item.title}</h2>
                      <Badge tone={fileKind(item) === "pdf" ? "info" : "neutral"}>
                        {kindLabel(item)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatFileSize(item.file_size)} ·{" "}
                      {formatDateTime(item.created_at)}
                    </p>
                  </div>
                  {isAdmin ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(item)}
                      title="Löschen"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  ) : null}
                </div>

                {item.description ? (
                  <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewDocument(item)}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    Öffnen
                  </Button>
                  <a
                    href={documentDownloadUrl(item)}
                    download={item.file_name}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium transition hover:bg-muted"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                </div>
              </div>
            </div>
          </Card>
        ))}

        {visibleDocuments.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground lg:col-span-2">
            Keine Dokumente gefunden.
          </Card>
        ) : null}
      </section>

      {previewDocument ? (
        <DocumentPreviewModal
          item={previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDocumentRemoval)}
        title="Dokument löschen?"
        description="Das Dokument wird dauerhaft aus der Ablage entfernt."
        detail={pendingDocumentRemoval?.title}
        confirmLabel="Dokument löschen"
        onCancel={() => setPendingDocumentRemoval(null)}
        onConfirm={confirmRemove}
      />
    </div>
  );
}

function DocumentPreviewModal({
  item,
  onClose,
}: {
  item: DocumentItem;
  onClose: () => void;
}) {
  const kind = fileKind(item);

  useEffect(() => {
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{item.title}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {item.file_name} · {formatFileSize(item.file_size)}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <a
              href={item.file_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium transition hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4" />
              Extern
            </a>
            <a
              href={documentDownloadUrl(item)}
              download={item.file_name}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium transition hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              Download
            </a>
            <Button type="button" variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-[320px] overflow-auto bg-muted/45 p-4">
          {kind === "image" ? (
            <img
              src={item.file_url}
              alt={item.title}
              className="mx-auto max-h-[70vh] max-w-full rounded-md object-contain"
            />
          ) : kind === "pdf" ? (
            <iframe
              src={item.file_url}
              title={item.title}
              className="h-[70vh] w-full rounded-md border border-border bg-card"
            />
          ) : (
            <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-lg border border-border bg-card p-8 text-center">
              <DocumentIcon item={item} className="mb-4 h-12 w-12 text-primary" />
              <h3 className="font-semibold">{kindLabel(item)} öffnen</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Für diesen Dateityp ist keine eingebettete Vorschau verfügbar.
                Du kannst das Dokument extern öffnen oder herunterladen.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
