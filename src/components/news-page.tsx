"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Eye,
  EyeOff,
  ImagePlus,
  Images,
  LayoutGrid,
  List,
  Loader2,
  Maximize2,
  Pencil,
  Plus,
  Star,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Label,
  Notice,
  PageHeader,
  Textarea,
} from "@/components/ui";
import type { Database } from "@/lib/database.types";
import { formatDateTime } from "@/lib/format";
import {
  NEWS_IMAGE_ACCEPTED_TYPES,
  NEWS_IMAGE_MAX_BYTES,
} from "@/lib/news-images";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type NewsItem = Database["public"]["Tables"]["news"]["Row"];
type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "email"
>;

type NewsImageEntry = {
  id: string;
  url: string;
  label: string;
  meta: string;
  file?: File;
  existingUrl?: string;
  previewUrl?: string;
};

type NewsViewMode = "grid" | "list";

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function authorDisplayName(profile: Profile | undefined, fallback: string) {
  return profile?.full_name?.trim() || profile?.email?.trim() || fallback;
}

function newsExcerpt(item: NewsItem, maxLength = 190) {
  const text = (item.excerpt?.trim() || item.content)
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength).trim()}...`;
}

function primaryImageUrl(item: NewsItem) {
  return item.image_urls?.[0] ?? null;
}

function publishedLabel(item: NewsItem) {
  return formatDateTime(item.published_at ?? item.created_at);
}

export function NewsPage({
  initialItems,
  initialProfiles,
  isAdmin,
  userId,
}: {
  initialItems: NewsItem[];
  initialProfiles: Profile[];
  isAdmin: boolean;
  userId: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [items, setItems] = useState(initialItems);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [editing, setEditing] = useState<NewsItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [imageEntries, setImageEntries] = useState<NewsImageEntry[]>([]);
  const [imageDragActive, setImageDragActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<NewsViewMode>("grid");
  const draftUrlsRef = useRef<string[]>([]);

  const profileById = useMemo(() => {
    const map = new Map<string, Profile>();
    profiles.forEach((profile) => map.set(profile.id, profile));
    return map;
  }, [profiles]);

  const visibleItems = isAdmin
    ? items
    : items.filter((item) => item.published);

  useEffect(() => {
    return () => {
      draftUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      draftUrlsRef.current = [];
    };
  }, []);

  async function reload() {
    const { data } = await supabase
      .from("news")
      .select("*")
      .order("created_at", { ascending: false });
    const nextItems = (data ?? []) as NewsItem[];
    setItems(nextItems);

    const authorIds = Array.from(
      new Set(nextItems.map((item) => item.author_id)),
    );

    if (authorIds.length === 0) {
      setProfiles([]);
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", authorIds);
    setProfiles((profileData ?? []) as Profile[]);
  }

  function clearImageDrafts() {
    draftUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    draftUrlsRef.current = [];
  }

  function closeForm() {
    clearImageDrafts();
    setImageEntries([]);
    setShowForm(false);
    setEditing(null);
  }

  function openCreate() {
    clearImageDrafts();
    setEditing(null);
    setTitle("");
    setExcerpt("");
    setContent("");
    setImageEntries([]);
    setShowForm(true);
    setMessage(null);
  }

  function openEdit(item: NewsItem) {
    clearImageDrafts();
    setEditing(item);
    setTitle(item.title);
    setExcerpt(item.excerpt ?? "");
    setContent(item.content);
    setImageEntries(
      (item.image_urls ?? []).map((url, index) => ({
        id: `existing-${index}-${url}`,
        url,
        existingUrl: url,
        label: `Bild ${index + 1}`,
        meta: "Gespeichert",
      })),
    );
    setShowForm(true);
    setMessage(null);
  }

  function addImageFiles(files: FileList | File[]) {
    const selectedFiles = Array.from(files);

    if (selectedFiles.length === 0) return;

    const invalidFile = selectedFiles.find(
      (file) => !NEWS_IMAGE_ACCEPTED_TYPES.includes(file.type),
    );

    if (invalidFile) {
      setMessage("Bitte Bilder im Format JPG, PNG, WebP oder GIF auswählen.");
      return;
    }

    const largeFile = selectedFiles.find(
      (file) => file.size > NEWS_IMAGE_MAX_BYTES,
    );

    if (largeFile) {
      setMessage("Ein Bild darf maximal 5 MB groß sein.");
      return;
    }

    const nextEntries = selectedFiles.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      draftUrlsRef.current.push(previewUrl);

      return {
        id: crypto.randomUUID(),
        file,
        previewUrl,
        url: previewUrl,
        label: file.name,
        meta: formatFileSize(file.size),
      };
    });

    setImageEntries((current) => [...current, ...nextEntries]);
    setMessage(null);
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      addImageFiles(event.target.files);
    }
    event.target.value = "";
  }

  function handleImageDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setImageDragActive(false);
    addImageFiles(event.dataTransfer.files);
  }

  function removeImageEntry(entryId: string) {
    setImageEntries((current) => {
      const entry = current.find((item) => item.id === entryId);

      if (entry?.previewUrl) {
        URL.revokeObjectURL(entry.previewUrl);
        draftUrlsRef.current = draftUrlsRef.current.filter(
          (url) => url !== entry.previewUrl,
        );
      }

      return current.filter((item) => item.id !== entryId);
    });
  }

  function makePrimaryImage(entryId: string) {
    setImageEntries((current) => {
      const entry = current.find((item) => item.id === entryId);
      if (!entry) return current;
      return [entry, ...current.filter((item) => item.id !== entryId)];
    });
  }

  async function uploadNewsImage(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/admin/news-images", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json().catch(() => ({}))) as {
      publicUrl?: string;
      error?: string;
    };

    if (!response.ok || !data.publicUrl) {
      throw new Error(data.error ?? "Das Bild konnte nicht hochgeladen werden.");
    }

    return data.publicUrl;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!title.trim()) {
      setMessage("Titel ist erforderlich.");
      return;
    }

    setLoading(true);

    try {
      const uploadedUrlsByEntryId = new Map<string, string>();

      await Promise.all(
        imageEntries.map(async (entry) => {
          if (!entry.file) return;
          const publicUrl = await uploadNewsImage(entry.file);
          uploadedUrlsByEntryId.set(entry.id, publicUrl);
        }),
      );

      const nextImageUrls = imageEntries
        .map((entry) => entry.existingUrl ?? uploadedUrlsByEntryId.get(entry.id))
        .filter((url): url is string => Boolean(url));
      const payload = {
        title: title.trim(),
        excerpt: excerpt.trim() || null,
        content: content.trim(),
        image_urls: nextImageUrls,
      };

      const { error } = editing
        ? await supabase.from("news").update(payload).eq("id", editing.id)
        : await supabase.from("news").insert({ ...payload, author_id: userId });

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
          : "Die Bilder konnten nicht hochgeladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function togglePublish(item: NewsItem) {
    const next = !item.published;
    const { error } = await supabase
      .from("news")
      .update({
        published: next,
        published_at: next ? new Date().toISOString() : null,
      })
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await reload();
  }

  async function remove(item: NewsItem) {
    if (!window.confirm(`News "${item.title}" löschen?`)) return;

    const { error } = await supabase.from("news").delete().eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="News"
        eyebrow="Ankündigungen"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex h-10 rounded-md border border-border bg-card p-1">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-sm px-3 text-sm font-medium transition",
                  viewMode === "grid"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                title="Grid View"
              >
                <LayoutGrid className="h-4 w-4" />
                Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-sm px-3 text-sm font-medium transition",
                  viewMode === "list"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                title="List View"
              >
                <List className="h-4 w-4" />
                Liste
              </button>
            </div>
            {isAdmin ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Neue News
              </Button>
            ) : null}
          </div>
        }
      />

      {message ? <Notice tone="danger">{message}</Notice> : null}

      {isAdmin && showForm ? (
        <Card className="min-w-0 overflow-hidden p-5">
          <form onSubmit={save} className="space-y-4">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <h2 className="font-semibold">
                {editing ? "News bearbeiten" : "Neue News"}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={closeForm}
                title="Schließen"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <Label htmlFor="news-title">Titel</Label>
                <Input
                  id="news-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <Label htmlFor="news-excerpt">Auszug</Label>
                <Input
                  id="news-excerpt"
                  value={excerpt}
                  onChange={(event) => setExcerpt(event.target.value)}
                  placeholder="Kurztext für die Übersicht"
                />
              </Field>
            </div>

            <Field>
              <Label htmlFor="news-content">Inhalt</Label>
              <Textarea
                id="news-content"
                rows={8}
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </Field>

            <Field>
              <Label htmlFor="news-images">Bilder / Galerie</Label>
              <Input
                id="news-images"
                type="file"
                multiple
                accept={NEWS_IMAGE_ACCEPTED_TYPES.join(",")}
                onChange={handleImageChange}
                className="sr-only"
              />
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                  setImageDragActive(true);
                }}
                onDragLeave={() => setImageDragActive(false)}
                onDrop={handleImageDrop}
                className={cn(
                  "min-w-0 rounded-lg border border-dashed bg-muted/45 p-3 transition",
                  imageDragActive
                    ? "border-primary bg-accent ring-2 ring-primary/15"
                    : "border-border",
                )}
              >
                {imageEntries.length > 0 ? (
                  <div className="mb-3 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {imageEntries.map((image, index) => (
                      <div
                        key={image.id}
                        className="group relative min-w-0 overflow-hidden rounded-md border border-border bg-card"
                      >
                        <div className="aspect-[4/3]">
                          <img
                            src={image.url}
                            alt={image.label}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-white">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium">
                                {image.label}
                              </p>
                              <p className="text-[11px] text-white/75">
                                {index === 0 ? "Titelbild" : image.meta}
                              </p>
                            </div>
                            {index === 0 ? (
                              <Star className="h-4 w-4 shrink-0 fill-white" />
                            ) : null}
                          </div>
                        </div>
                        <div className="absolute right-2 top-2 flex gap-1">
                          {index > 0 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => makePrimaryImage(image.id)}
                              className="h-8 w-8 bg-white/90 hover:bg-white"
                              title="Als Titelbild verwenden"
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeImageEntry(image.id)}
                            className="h-8 w-8 bg-white/90 hover:bg-white"
                            title="Bild entfernen"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mb-3 flex min-h-[150px] flex-col items-center justify-center gap-3 rounded-md border border-border bg-card text-center">
                    <ImagePlus className="h-10 w-10 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Bilder hinzufügen</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        JPG, PNG, WebP oder GIF bis 5 MB pro Bild
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <label
                    htmlFor="news-images"
                    className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm transition hover:bg-white"
                  >
                    <CloudUpload className="h-4 w-4 text-primary" />
                    Bilder auswählen
                  </label>
                  {imageEntries.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {imageEntries.length}{" "}
                      {imageEntries.length === 1 ? "Bild" : "Bilder"}
                    </p>
                  ) : null}
                </div>
              </div>
            </Field>

            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Speichern
            </Button>
          </form>
        </Card>
      ) : null}

      <section
        className={cn(
          "grid",
          viewMode === "grid" ? "gap-5 lg:grid-cols-2" : "grid-cols-1 gap-3",
        )}
      >
        {visibleItems.map((item, index) => {
          const author = authorDisplayName(
            profileById.get(item.author_id),
            "Unbekannter Autor",
          );
          const imageUrl = primaryImageUrl(item);
          const featured = viewMode === "grid" && index === 0;

          if (viewMode === "list") {
            return (
              <Card key={item.id} className="min-w-0 overflow-hidden">
                <div className="grid min-w-0 gap-3 p-3 md:grid-cols-[150px_minmax(0,1fr)_auto] md:items-center">
                  <Link
                    href={`/news/${item.id}`}
                    className="block h-28 min-w-0 overflow-hidden rounded-md bg-muted md:h-24"
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={item.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <NewspaperFallbackIcon />
                      </div>
                    )}
                  </Link>

                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {isAdmin ? (
                        <Badge tone={item.published ? "success" : "neutral"}>
                          {item.published ? "Veröffentlicht" : "Entwurf"}
                        </Badge>
                      ) : null}
                      {index === 0 ? <Badge tone="info">Neu</Badge> : null}
                      {item.image_urls.length > 1 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Images className="h-3.5 w-3.5" />
                          {item.image_urls.length} Bilder
                        </span>
                      ) : null}
                    </div>
                    <Link href={`/news/${item.id}`} className="block">
                      <h2 className="line-clamp-1 text-base font-semibold transition hover:text-primary">
                        {item.title}
                      </h2>
                    </Link>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="h-3.5 w-3.5" />
                        {author}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {publishedLabel(item)}
                      </span>
                    </p>
                    {newsExcerpt(item) ? (
                      <p className="line-clamp-1 text-sm text-muted-foreground">
                        {newsExcerpt(item)}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center justify-start gap-2 md:flex-col md:items-end">
                    {isAdmin ? (
                      <NewsAdminActions
                        item={item}
                        onTogglePublish={togglePublish}
                        onEdit={openEdit}
                        onRemove={remove}
                      />
                    ) : null}
                    <Link
                      href={`/news/${item.id}`}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-medium transition hover:bg-muted"
                    >
                      Weiterlesen
                    </Link>
                  </div>
                </div>
              </Card>
            );
          }

          return (
            <Card
              key={item.id}
              className={cn(
                "min-w-0 overflow-hidden",
                featured ? "lg:col-span-2 lg:grid lg:grid-cols-[1.15fr_1fr]" : "",
              )}
            >
              <Link
                href={`/news/${item.id}`}
                className={cn(
                  "block min-w-0 bg-muted",
                  featured ? "aspect-[16/9] lg:aspect-auto" : "aspect-[16/10]",
                )}
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={item.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <NewspaperFallbackIcon />
                  </div>
                )}
              </Link>

              <div className="flex min-w-0 flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {isAdmin ? (
                        <Badge tone={item.published ? "success" : "neutral"}>
                          {item.published ? "Veröffentlicht" : "Entwurf"}
                        </Badge>
                      ) : null}
                      {featured ? <Badge tone="info">Neu</Badge> : null}
                    </div>
                    <Link href={`/news/${item.id}`} className="block">
                      <h2
                        className={cn(
                          "line-clamp-2 font-semibold transition hover:text-primary",
                          featured ? "text-2xl" : "text-xl",
                        )}
                      >
                        {item.title}
                      </h2>
                    </Link>
                  </div>

                  {isAdmin ? (
                    <NewsAdminActions
                      item={item}
                      onTogglePublish={togglePublish}
                      onEdit={openEdit}
                      onRemove={remove}
                    />
                  ) : null}
                </div>

                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <UserRound className="h-3.5 w-3.5" />
                    {author}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {publishedLabel(item)}
                  </span>
                </p>

                {newsExcerpt(item) ? (
                  <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {newsExcerpt(item)}
                  </p>
                ) : null}

                <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                  <Link
                    href={`/news/${item.id}`}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-medium transition hover:bg-muted"
                  >
                    Weiterlesen
                  </Link>
                  {item.image_urls.length > 1 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Images className="h-3.5 w-3.5" />
                      {item.image_urls.length} Bilder
                    </span>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}

        {visibleItems.length === 0 ? (
          <Card
            className={cn(
              "p-8 text-center text-sm text-muted-foreground",
              viewMode === "grid" ? "lg:col-span-2" : "",
            )}
          >
            Keine News vorhanden.
          </Card>
        ) : null}
      </section>
    </div>
  );
}

export function NewsDetailPage({
  item,
  author,
  isAdmin,
}: {
  item: NewsItem;
  author: string;
  isAdmin: boolean;
}) {
  const imageUrls = item.image_urls ?? [];
  const heroImageUrl = imageUrls[0] ?? null;
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/news"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium transition hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Link>
      </div>

      <article className="space-y-6">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin ? (
              <Badge tone={item.published ? "success" : "neutral"}>
                {item.published ? "Veröffentlicht" : "Entwurf"}
              </Badge>
            ) : null}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <UserRound className="h-3.5 w-3.5" />
              {author}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              {publishedLabel(item)}
            </span>
          </div>

          <div className="max-w-3xl space-y-3">
            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
              {item.title}
            </h1>
            {newsExcerpt(item, 260) ? (
              <p className="text-base leading-7 text-muted-foreground">
                {newsExcerpt(item, 260)}
              </p>
            ) : null}
          </div>
        </header>

        {heroImageUrl ? (
          <button
            type="button"
            onClick={() => setLightboxIndex(0)}
            className="group relative block w-full overflow-hidden rounded-lg border border-border bg-muted text-left"
          >
            <div className="aspect-[16/8] min-h-[260px]">
              <img
                src={heroImageUrl}
                alt={item.title}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.01]"
              />
            </div>
            <span className="absolute bottom-3 right-3 inline-flex h-9 items-center gap-2 rounded-md bg-white/95 px-3 text-sm font-medium shadow-sm">
              <Maximize2 className="h-4 w-4" />
              Ansehen
            </span>
          </button>
        ) : null}

        {item.content ? (
          <Card className="p-5 sm:p-6">
            <div className="max-w-3xl whitespace-pre-wrap text-sm leading-7 text-foreground/85 sm:text-base">
              {item.content}
            </div>
          </Card>
        ) : null}

        {imageUrls.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Images className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Galerie</h2>
            </div>
            <NewsImageGallery
              imageUrls={imageUrls}
              title={item.title}
              onOpen={setLightboxIndex}
            />
          </section>
        ) : null}
      </article>

      {lightboxIndex !== null ? (
        <NewsLightbox
          imageUrls={imageUrls}
          title={item.title}
          activeIndex={lightboxIndex}
          onChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  );
}

function NewsAdminActions({
  item,
  onTogglePublish,
  onEdit,
  onRemove,
}: {
  item: NewsItem;
  onTogglePublish: (item: NewsItem) => void;
  onEdit: (item: NewsItem) => void;
  onRemove: (item: NewsItem) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onTogglePublish(item)}
        title={item.published ? "Unveröffentlichen" : "Veröffentlichen"}
      >
        {item.published ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onEdit(item)}
        title="Bearbeiten"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onRemove(item)}
        title="Löschen"
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

function NewsImageGallery({
  imageUrls,
  title,
  onOpen,
}: {
  imageUrls: string[];
  title: string;
  onOpen: (index: number) => void;
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        imageUrls.length === 1
          ? "grid-cols-1"
          : "grid-cols-2 md:grid-cols-3",
      )}
    >
      {imageUrls.map((url, index) => (
        <button
          key={`${url}-${index}`}
          type="button"
          onClick={() => onOpen(index)}
          className="group relative overflow-hidden rounded-md border border-border bg-muted text-left"
        >
          <div className="aspect-[4/3]">
            <img
              src={url}
              alt={`${title} Bild ${index + 1}`}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          </div>
          <span className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/90 shadow-sm opacity-0 transition group-hover:opacity-100">
            <Maximize2 className="h-4 w-4" />
          </span>
        </button>
      ))}
    </div>
  );
}

function NewsLightbox({
  imageUrls,
  title,
  activeIndex,
  onChange,
  onClose,
}: {
  imageUrls: string[];
  title: string;
  activeIndex: number;
  onChange: (index: number) => void;
  onClose: () => void;
}) {
  const activeImageUrl = imageUrls[activeIndex];
  const hasMultipleImages = imageUrls.length > 1;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && hasMultipleImages) {
        onChange((activeIndex - 1 + imageUrls.length) % imageUrls.length);
      }
      if (event.key === "ArrowRight" && hasMultipleImages) {
        onChange((activeIndex + 1) % imageUrls.length);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeIndex, hasMultipleImages, imageUrls.length, onChange, onClose]);

  if (!activeImageUrl) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-white/95 shadow-sm"
        title="Schließen"
      >
        <X className="h-5 w-5" />
      </button>

      {hasMultipleImages ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onChange((activeIndex - 1 + imageUrls.length) % imageUrls.length);
          }}
          className="absolute left-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md bg-white/95 shadow-sm"
          title="Vorheriges Bild"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : null}

      <div
        className="max-h-[86vh] max-w-[92vw]"
        onClick={(event) => event.stopPropagation()}
      >
        <img
          src={activeImageUrl}
          alt={`${title} Bild ${activeIndex + 1}`}
          className="max-h-[86vh] max-w-[92vw] rounded-md object-contain shadow-2xl"
        />
        {hasMultipleImages ? (
          <p className="mt-3 text-center text-sm text-white/85">
            {activeIndex + 1} / {imageUrls.length}
          </p>
        ) : null}
      </div>

      {hasMultipleImages ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onChange((activeIndex + 1) % imageUrls.length);
          }}
          className="absolute right-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md bg-white/95 shadow-sm"
          title="Nächstes Bild"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      ) : null}
    </div>
  );
}

function NewspaperFallbackIcon() {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-primary/20 bg-card text-primary">
      <Images className="h-7 w-7" />
    </div>
  );
}
