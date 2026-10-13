import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/admin-api";
import {
  CUSTOM_PAGE_FILE_ACCEPTED_TYPES,
  CUSTOM_PAGE_FILE_BUCKET,
  CUSTOM_PAGE_FILE_MAX_BYTES,
  isPdfFile,
} from "@/lib/custom-pages";
import { hasSupabaseEnv } from "@/lib/supabase/env";

async function ensureBucket() {
  const auth = await requireApiAdmin();
  if ("error" in auth) return auth;

  const { error: getError } = await auth.admin.storage.getBucket(
    CUSTOM_PAGE_FILE_BUCKET,
  );
  if (getError) {
    const { error: createError } = await auth.admin.storage.createBucket(
      CUSTOM_PAGE_FILE_BUCKET,
      {
        public: false,
        fileSizeLimit: CUSTOM_PAGE_FILE_MAX_BYTES,
        allowedMimeTypes: CUSTOM_PAGE_FILE_ACCEPTED_TYPES,
      },
    );
    if (createError && !createError.message.toLowerCase().includes("exist")) {
      return { error: createError.message, status: 500 as const };
    }
  }

  return auth;
}

export async function POST(request: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(
      { error: "Supabase ist noch nicht konfiguriert." },
      { status: 503 },
    );
  }

  const auth = await ensureBucket();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const pageId = String(formData.get("page_id") ?? "").trim();

  if (!pageId) {
    return NextResponse.json({ error: "Seiten-ID fehlt." }, { status: 400 });
  }
  if (!(file instanceof File) || !isPdfFile(file)) {
    return NextResponse.json(
      { error: "Bitte eine PDF-Datei auswählen." },
      { status: 400 },
    );
  }
  if (file.size > CUSTOM_PAGE_FILE_MAX_BYTES) {
    return NextResponse.json(
      { error: "Eine PDF-Datei darf maximal 20 MB groß sein." },
      { status: 400 },
    );
  }

  const { data: page } = await auth.admin
    .from("custom_pages")
    .select("id")
    .eq("id", pageId)
    .maybeSingle();
  if (!page) {
    return NextResponse.json(
      { error: "Seite wurde nicht gefunden." },
      { status: 404 },
    );
  }

  const filePath = `${pageId}/${crypto.randomUUID()}.pdf`;
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await auth.admin.storage
    .from(CUSTOM_PAGE_FILE_BUCKET)
    .upload(filePath, fileBuffer, {
      cacheControl: "3600",
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data: storedFile, error } = await auth.admin
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

  if (error || !storedFile) {
    await auth.admin.storage.from(CUSTOM_PAGE_FILE_BUCKET).remove([filePath]);
    return NextResponse.json(
      { error: error?.message ?? "PDF konnte nicht gespeichert werden." },
      { status: 400 },
    );
  }

  return NextResponse.json({ file: storedFile });
}
