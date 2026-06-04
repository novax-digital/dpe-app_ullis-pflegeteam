import { NextResponse } from "next/server";
import {
  DOCUMENT_FILE_ACCEPTED_TYPES,
  DOCUMENT_FILE_BUCKET,
  DOCUMENT_FILE_EXTENSION_BY_TYPE,
  DOCUMENT_FILE_MAX_BYTES,
} from "@/lib/document-files";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function ensureDocumentFileBucket() {
  const admin = createSupabaseAdminClient();
  const { error: getError } = await admin.storage.getBucket(
    DOCUMENT_FILE_BUCKET,
  );

  if (!getError) {
    await admin.storage.updateBucket(DOCUMENT_FILE_BUCKET, {
      public: true,
      fileSizeLimit: DOCUMENT_FILE_MAX_BYTES,
      allowedMimeTypes: DOCUMENT_FILE_ACCEPTED_TYPES,
    });
    return admin;
  }

  const { error: createError } = await admin.storage.createBucket(
    DOCUMENT_FILE_BUCKET,
    {
      public: true,
      fileSizeLimit: DOCUMENT_FILE_MAX_BYTES,
      allowedMimeTypes: DOCUMENT_FILE_ACCEPTED_TYPES,
    },
  );

  if (createError && !createError.message.toLowerCase().includes("exist")) {
    throw createError;
  }

  return admin;
}

export async function POST(request: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(
      { error: "Supabase ist noch nicht konfiguriert." },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Nicht authentifiziert." },
      { status: 401 },
    );
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }

  const { data: adminRole } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!adminRole) {
    return NextResponse.json(
      { error: "Nur Administrator:innen duerfen Dokumente hochladen." },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Datei fehlt." }, { status: 400 });
  }

  if (!DOCUMENT_FILE_ACCEPTED_TYPES.includes(file.type)) {
    return NextResponse.json(
      {
        error:
          "Bitte PDF, Bilddatei, Word-, Excel-, PowerPoint- oder Textdatei auswählen.",
      },
      { status: 400 },
    );
  }

  if (file.size > DOCUMENT_FILE_MAX_BYTES) {
    return NextResponse.json(
      { error: "Die Datei darf maximal 20 MB groß sein." },
      { status: 400 },
    );
  }

  try {
    admin = await ensureDocumentFileBucket();
    const extension = DOCUMENT_FILE_EXTENSION_BY_TYPE[file.type] ?? "bin";
    const filePath = `documents/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage
      .from(DOCUMENT_FILE_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        contentType: file.type,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const {
      data: { publicUrl },
    } = admin.storage.from(DOCUMENT_FILE_BUCKET).getPublicUrl(filePath);

    return NextResponse.json({
      fileUrl: publicUrl,
      filePath,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die Datei konnte nicht hochgeladen werden.",
      },
      { status: 500 },
    );
  }
}
