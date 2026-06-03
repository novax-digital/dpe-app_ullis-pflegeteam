"use client";

import { FormEvent, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge, Button, Card, Field, Input, Label, Notice, PageHeader, Textarea } from "@/components/ui";
import type { Database } from "@/lib/database.types";
import { formatDateTime } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type NewsItem = Database["public"]["Tables"]["news"]["Row"];

export function NewsPage({
  initialItems,
  isAdmin,
  userId,
}: {
  initialItems: NewsItem[];
  isAdmin: boolean;
  userId: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [items, setItems] = useState(initialItems);
  const [editing, setEditing] = useState<NewsItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function reload() {
    const { data } = await supabase
      .from("news")
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data ?? []) as NewsItem[]);
  }

  function openCreate() {
    setEditing(null);
    setTitle("");
    setContent("");
    setShowForm(true);
    setMessage(null);
  }

  function openEdit(item: NewsItem) {
    setEditing(item);
    setTitle(item.title);
    setContent(item.content);
    setShowForm(true);
    setMessage(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!title.trim()) {
      setMessage("Titel ist erforderlich.");
      return;
    }

    setLoading(true);

    const payload = {
      title: title.trim(),
      content: content.trim(),
    };

    const { error } = editing
      ? await supabase.from("news").update(payload).eq("id", editing.id)
      : await supabase.from("news").insert({ ...payload, author_id: userId });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setShowForm(false);
    setEditing(null);
    await reload();
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
          isAdmin ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Neue News
            </Button>
          ) : undefined
        }
      />

      {message ? <Notice tone="danger">{message}</Notice> : null}

      {isAdmin && showForm ? (
        <Card className="p-5">
          <form onSubmit={save} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">
                {editing ? "News bearbeiten" : "Neue News"}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowForm(false)}
                title="Schließen"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
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
              <Label htmlFor="news-content">Inhalt</Label>
              <Textarea
                id="news-content"
                rows={7}
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </Field>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Speichern
            </Button>
          </form>
        </Card>
      ) : null}

      <section className="space-y-3">
        {items.map((item) => (
          <Card key={item.id} className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{item.title}</h2>
                  {isAdmin ? (
                    <Badge tone={item.published ? "success" : "neutral"}>
                      {item.published ? "Veröffentlicht" : "Entwurf"}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(item.published_at ?? item.created_at)}
                </p>
              </div>
              {isAdmin ? (
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => togglePublish(item)}
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
                    onClick={() => openEdit(item)}
                    title="Bearbeiten"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(item)}
                    title="Löschen"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ) : null}
            </div>
            {item.content ? (
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground/80">
                {item.content}
              </p>
            ) : null}
          </Card>
        ))}

        {items.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Keine News vorhanden.
          </Card>
        ) : null}
      </section>
    </div>
  );
}
