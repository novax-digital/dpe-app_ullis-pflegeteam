import { NextResponse } from "next/server";
import {
  NEWS_IMAGE_ACCEPTED_TYPES,
  NEWS_IMAGE_BUCKET,
  NEWS_IMAGE_EXTENSION_BY_TYPE,
  NEWS_IMAGE_MAX_BYTES,
} from "@/lib/news-images";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function ensureNewsImageBucket() {
  const admin = createSupabaseAdminClient();
  const { error: getError } = await admin.storage.getBucket(NEWS_IMAGE_BUCKET);

  if (!getError) {
    await admin.storage.updateBucket(NEWS_IMAGE_BUCKET, {
      public: true,
      fileSizeLimit: NEWS_IMAGE_MAX_BYTES,
      allowedMimeTypes: NEWS_IMAGE_ACCEPTED_TYPES,
    });
    return admin;
  }

  const { error: createError } = await admin.storage.createBucket(
    NEWS_IMAGE_BUCKET,
    {
      public: true,
      fileSizeLimit: NEWS_IMAGE_MAX_BYTES,
      allowedMimeTypes: NEWS_IMAGE_ACCEPTED_TYPES,
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
      { error: "Nur Administrator:innen duerfen News-Bilder hochladen." },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Bild fehlt." }, { status: 400 });
  }

  if (!NEWS_IMAGE_ACCEPTED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Bitte ein Bild im Format JPG, PNG, WebP oder GIF auswählen." },
      { status: 400 },
    );
  }

  if (file.size > NEWS_IMAGE_MAX_BYTES) {
    return NextResponse.json(
      { error: "Das Bild darf maximal 5 MB groß sein." },
      { status: 400 },
    );
  }

  try {
    admin = await ensureNewsImageBucket();
    const extension = NEWS_IMAGE_EXTENSION_BY_TYPE[file.type] ?? "jpg";
    const filePath = `news/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage
      .from(NEWS_IMAGE_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        contentType: file.type,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const {
      data: { publicUrl },
    } = admin.storage.from(NEWS_IMAGE_BUCKET).getPublicUrl(filePath);

    return NextResponse.json({ publicUrl });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Das Bild konnte nicht hochgeladen werden.",
      },
      { status: 500 },
    );
  }
}
