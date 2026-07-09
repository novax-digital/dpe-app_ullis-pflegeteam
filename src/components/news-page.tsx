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
  MessageCircle,
  Pencil,
  Plus,
  Send,
  Star,
  Trash2,
  UserRound,
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
  Select,
  Textarea,
} from "@/components/ui";
import type { Database } from "@/lib/database.types";
import { formatDateTime } from "@/lib/format";
import {
  NEWS_IMAGE_ACCEPTED_TYPES,
  NEWS_IMAGE_MAX_BYTES,
} from "@/lib/news-images";
import { normalizeNewsSettings } from "@/lib/news-settings";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type NewsItem = Database["public"]["Tables"]["news"]["Row"];
type NewsComment = Database["public"]["Tables"]["news_comments"]["Row"];
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
type NoticeTone = "neutral" | "success" | "danger";
type NotificationResult = {
  sent?: boolean;
  recipientCount?: number;
  skippedReason?: string;
  error?: string;
};

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
  initialCategories,
  isAdmin,
  userId,
}: {
  initialItems: NewsItem[];
  initialProfiles: Profile[];
  initialCategories: string[];
  isAdmin: boolean;
  userId: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [items, setItems] = useState(initialItems);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [categories, setCategories] = useState(initialCategories);
  const [editing, setEditing] = useState<NewsItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [sendNotification, setSendNotification] = useState(false);
  const [imageEntries, setImageEntries] = useState<NewsImageEntry[]>([]);
  const [imageDragActive, setImageDragActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<NoticeTone>("danger");
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<NewsViewMode>("grid");
  const [pendingNewsRemoval, setPendingNewsRemoval] = useState<NewsItem | null>(
    null,
  );
  const draftUrlsRef = useRef<string[]>([]);

  const profileById = useMemo(() => {
    const map = new Map<string, Profile>();
    profiles.forEach((profile) => map.set(profile.id, profile));
    return map;
  }, [profiles]);

  const visibleItems = isAdmin
    ? items
    : items.filter((item) => item.published);
  const notificationAlreadySent = Boolean(editing?.notification_sent_at);
  const canRequestNotification = isAdmin && !notificationAlreadySent;

  useEffect(() => {
    return () => {
      draftUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      draftUrlsRef.current = [];
    };
  }, []);

  async function reload() {
    const [newsResult, settingsResult] = await Promise.all([
      supabase.from("news").select("*").order("created_at", {
        ascending: false,
      }),
      supabase
        .from("news_settings")
        .select("*")
        .eq("id", "default")
        .maybeSingle(),
    ]);
    const nextItems = (newsResult.data ?? []) as NewsItem[];
    setItems(nextItems);
    setCategories(normalizeNewsSettings(settingsResult.data).categories);

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
    setSendNotification(false);
  }

  function showNotice(text: string, tone: NoticeTone = "danger") {
    setMessage(text);
    setMessageTone(tone);
  }

  function notificationNotice(notification: NotificationResult | undefined) {
    if (!notification) return null;

    if (notification.error) {
      return `Nachricht gespeichert, Mailversand fehlgeschlagen: ${notification.error}`;
    }

    if (
      notification.skippedReason?.includes("RESEND") ||
      notification.skippedReason?.includes("keine Mitarbeiter-E-Mail")
    ) {
      return `Nachricht gespeichert, Mailversand ausgelassen: ${notification.skippedReason}`;
    }

    if (notification.sent) {
      return `Nachricht gespeichert und an ${notification.recipientCount ?? 0} Mitarbeiter:innen versendet.`;
    }

    return null;
  }

  function openCreate() {
    clearImageDrafts();
    setEditing(null);
    setTitle("");
    setCategory("");
    setExcerpt("");
    setContent("");
    setSendNotification(false);
    setImageEntries([]);
    setShowForm(true);
    setMessage(null);
    setMessageTone("danger");
  }

  function openEdit(item: NewsItem) {
    clearImageDrafts();
    setEditing(item);
    setTitle(item.title);
    setCategory(item.category ?? "");
    setExcerpt(item.excerpt ?? "");
    setContent(item.content);
    setSendNotification(false);
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
    setMessageTone("danger");
  }

  function addImageFiles(files: FileList | File[]) {
    const selectedFiles = Array.from(files);

    if (selectedFiles.length === 0) return;

    const invalidFile = selectedFiles.find(
      (file) => !NEWS_IMAGE_ACCEPTED_TYPES.includes(file.type),
    );

    if (invalidFile) {
      showNotice("Bitte Bilder im Format JPG, PNG, WebP oder GIF auswählen.");
      return;
    }

    const largeFile = selectedFiles.find(
      (file) => file.size > NEWS_IMAGE_MAX_BYTES,
    );

    if (largeFile) {
      showNotice("Ein Bild darf maximal 12 MB groß sein.");
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

    const response = await fetch("/api/news-images", {
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
      showNotice("Titel ist erforderlich.");
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
        category: category.trim() || null,
        excerpt: excerpt.trim() || null,
        content: content.trim(),
        image_urls: nextImageUrls,
        send_notification: canRequestNotification && sendNotification,
      };

      const response = await fetch(
        editing ? `/api/news/${editing.id}` : "/api/news",
        {
          method: editing ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        notification?: NotificationResult;
      };

      if (!response.ok) {
        showNotice(data.error ?? "Die Nachricht konnte nicht gespeichert werden.");
        return;
      }

      closeForm();
      await reload();
      const nextNotice = notificationNotice(data.notification);
      if (nextNotice) {
        showNotice(
          nextNotice,
          data.notification?.sent
            ? "success"
            : data.notification?.error
              ? "danger"
              : "neutral",
        );
      }
    } catch (error) {
      showNotice(
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
    const response = await fetch(`/api/news/${item.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ published: next }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      notification?: NotificationResult;
    };

    if (!response.ok) {
      showNotice(data.error ?? "Der Status konnte nicht geändert werden.");
      return;
    }

    await reload();
    const nextNotice = notificationNotice(data.notification);
    if (nextNotice) {
      showNotice(
        nextNotice,
        data.notification?.sent
          ? "success"
          : data.notification?.error
            ? "danger"
            : "neutral",
      );
    }
  }

  function remove(item: NewsItem) {
    setPendingNewsRemoval(item);
  }

  async function confirmRemove() {
    const item = pendingNewsRemoval;
    if (!item) return;
    setPendingNewsRemoval(null);

    const response = await fetch(`/api/news/${item.id}`, {
      method: "DELETE",
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    if (!response.ok) {
      showNotice(data.error ?? "Die Nachricht konnte nicht gelöscht werden.");
      return;
    }

    await reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nachrichten"
        eyebrow="Team-Updates"
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
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Neue Nachricht
            </Button>
          </div>
        }
      />

      {message ? <Notice tone={messageTone}>{message}</Notice> : null}

      {showForm ? (
        <Card className="min-w-0 overflow-hidden p-5">
          <form onSubmit={save} className="space-y-4">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <h2 className="font-semibold">
                {editing ? "Nachricht bearbeiten" : "Neue Nachricht"}
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
                <Label htmlFor="news-category">Kategorie</Label>
                <Select
                  id="news-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="">Ohne Kategorie</option>
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
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

            {isAdmin ? (
              <label
                className={cn(
                  "flex flex-col gap-3 rounded-md border border-border bg-muted/35 p-4 text-sm sm:flex-row sm:items-center sm:justify-between",
                  notificationAlreadySent ? "opacity-75" : "",
                )}
              >
                <span className="flex min-w-0 items-start gap-3">
                  <input
                    type="checkbox"
                    checked={sendNotification && canRequestNotification}
                    disabled={!canRequestNotification}
                    onChange={(event) =>
                      setSendNotification(event.target.checked)
                    }
                    className="mt-1 h-4 w-4 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-medium">
                      <Send className="h-4 w-4 text-primary" />
                      Per E-Mail an alle Mitarbeiter:innen senden
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      Verschickt eine einmalige Benachrichtigung mit Titel,
                      kurzem Auszug und Link zur News.
                    </span>
                  </span>
                </span>
                {notificationAlreadySent ? (
                  <Badge tone="success" className="self-start sm:self-center">
                    Bereits versendet
                  </Badge>
                ) : null}
              </label>
            ) : null}

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
                            decoding="async"
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
                        JPG, PNG, WebP oder GIF bis 12 MB pro Bild
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
                    href={`/nachrichten/${item.id}`}
                    className="block h-28 min-w-0 overflow-hidden rounded-md bg-muted md:h-24"
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={item.title}
                        loading="lazy"
                        decoding="async"
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
                      {item.category ? (
                        <Badge tone="info">{item.category}</Badge>
                      ) : null}
                      {item.image_urls.length > 1 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Images className="h-3.5 w-3.5" />
                          {item.image_urls.length} Bilder
                        </span>
                      ) : null}
                    </div>
                    <Link href={`/nachrichten/${item.id}`} className="block">
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
                    {isAdmin || item.author_id === userId ? (
                      <NewsItemActions
                        item={item}
                        canPublish={isAdmin}
                        onTogglePublish={togglePublish}
                        onEdit={openEdit}
                        onRemove={remove}
                      />
                    ) : null}
                    <Link
                      href={`/nachrichten/${item.id}`}
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
                href={`/nachrichten/${item.id}`}
                className={cn(
                  "block min-w-0 bg-muted",
                  featured ? "aspect-[16/9] lg:aspect-auto" : "aspect-[16/10]",
                )}
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={item.title}
                    loading={featured ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={featured ? "high" : "auto"}
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
                      {item.category ? (
                        <Badge tone="info">{item.category}</Badge>
                      ) : null}
                    </div>
                    <Link href={`/nachrichten/${item.id}`} className="block">
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

                  {isAdmin || item.author_id === userId ? (
                    <NewsItemActions
                      item={item}
                      canPublish={isAdmin}
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
                    href={`/nachrichten/${item.id}`}
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
        Keine Nachrichten vorhanden.
      </Card>
    ) : null}
  </section>

      <ConfirmDialog
        open={Boolean(pendingNewsRemoval)}
        title="Nachricht löschen?"
        description="Diese Nachricht wird dauerhaft aus dem Team-Feed entfernt."
        detail={pendingNewsRemoval?.title}
        confirmLabel="Nachricht löschen"
        onCancel={() => setPendingNewsRemoval(null)}
        onConfirm={confirmRemove}
      />
    </div>
  );
}

export function NewsDetailPage({
  item,
  author,
  comments: initialComments,
  commentProfiles: initialCommentProfiles,
  isAdmin,
  userId,
}: {
  item: NewsItem;
  author: string;
  comments: NewsComment[];
  commentProfiles: Profile[];
  isAdmin: boolean;
  userId: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const imageUrls = item.image_urls ?? [];
  const heroImageUrl = imageUrls[0] ?? null;
  const [comments, setComments] = useState(initialComments);
  const [commentProfiles, setCommentProfiles] = useState(
    initialCommentProfiles,
  );
  const [commentContent, setCommentContent] = useState("");
  const [commentMessage, setCommentMessage] = useState<string | null>(null);
  const [commentLoading, setCommentLoading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [pendingCommentRemoval, setPendingCommentRemoval] =
    useState<NewsComment | null>(null);
  const commentProfileById = useMemo(() => {
    const map = new Map<string, Profile>();
    commentProfiles.forEach((profile) => map.set(profile.id, profile));
    return map;
  }, [commentProfiles]);

  async function reloadComments() {
    const { data: nextComments } = await supabase
      .from("news_comments")
      .select("*")
      .eq("news_id", item.id)
      .order("created_at", { ascending: true });
    const commentRows = (nextComments ?? []) as NewsComment[];
    setComments(commentRows);

    const profileIds = Array.from(
      new Set(commentRows.map((comment) => comment.author_id)),
    );

    if (profileIds.length === 0) {
      setCommentProfiles([]);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", profileIds);
    setCommentProfiles((profiles ?? []) as Profile[]);
  }

  async function createComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCommentMessage(null);

    const content = commentContent.trim();
    if (!content) {
      setCommentMessage("Kommentar ist erforderlich.");
      return;
    }

    setCommentLoading(true);
    const { error } = await supabase.from("news_comments").insert({
      news_id: item.id,
      author_id: userId,
      content,
    });
    setCommentLoading(false);

    if (error) {
      setCommentMessage(error.message);
      return;
    }

    setCommentContent("");
    await reloadComments();
  }

  function removeComment(comment: NewsComment) {
    setPendingCommentRemoval(comment);
  }

  async function confirmRemoveComment() {
    const comment = pendingCommentRemoval;
    if (!comment) return;
    setPendingCommentRemoval(null);

    const { error } = await supabase
      .from("news_comments")
      .delete()
      .eq("id", comment.id);

    if (error) {
      setCommentMessage(error.message);
      return;
    }

    await reloadComments();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/nachrichten"
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
            {item.category ? <Badge tone="info">{item.category}</Badge> : null}
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
                loading="eager"
                decoding="async"
                fetchPriority="high"
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

      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Kommentare</h2>
        </div>

        <form onSubmit={createComment} className="space-y-3">
          <Field>
            <Label htmlFor="news-comment">Kommentar</Label>
            <Textarea
              id="news-comment"
              rows={3}
              value={commentContent}
              onChange={(event) => setCommentContent(event.target.value)}
              placeholder="Antwort schreiben"
              required
            />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={commentLoading}>
              {commentLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Kommentieren
            </Button>
            {commentMessage ? (
              <p className="text-sm text-destructive">{commentMessage}</p>
            ) : null}
          </div>
        </form>

        <div className="mt-5 space-y-3">
          {comments.map((comment) => {
            const profile = commentProfileById.get(comment.author_id);
            const commentAuthor = authorDisplayName(
              profile,
              "Unbekannter Nutzer",
            );
            const canRemove = isAdmin || comment.author_id === userId;

            return (
              <div
                key={comment.id}
                className="rounded-md border border-border bg-muted/35 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{commentAuthor}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(comment.created_at)}
                    </p>
                  </div>
                  {canRemove ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeComment(comment)}
                      title="Kommentar löschen"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/85">
                  {comment.content}
                </p>
              </div>
            );
          })}

          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Kommentare vorhanden.
            </p>
          ) : null}
        </div>
      </Card>

      {lightboxIndex !== null ? (
        <NewsLightbox
          imageUrls={imageUrls}
          title={item.title}
          activeIndex={lightboxIndex}
          onChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingCommentRemoval)}
        title="Kommentar löschen?"
        description="Der Kommentar wird dauerhaft entfernt."
        detail={
          pendingCommentRemoval ? (
            <span className="line-clamp-3 block">
              {pendingCommentRemoval.content}
            </span>
          ) : null
        }
        confirmLabel="Kommentar löschen"
        onCancel={() => setPendingCommentRemoval(null)}
        onConfirm={confirmRemoveComment}
      />
    </div>
  );
}

function NewsItemActions({
  item,
  canPublish,
  onTogglePublish,
  onEdit,
  onRemove,
}: {
  item: NewsItem;
  canPublish: boolean;
  onTogglePublish: (item: NewsItem) => void;
  onEdit: (item: NewsItem) => void;
  onRemove: (item: NewsItem) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      {canPublish ? (
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
      ) : null}
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
              loading="lazy"
              decoding="async"
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
          decoding="async"
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
