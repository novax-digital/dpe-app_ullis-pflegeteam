import { NextResponse } from "next/server";
import {
  COURSE_IMAGE_ACCEPTED_TYPES,
  COURSE_IMAGE_BUCKET,
  COURSE_IMAGE_EXTENSION_BY_TYPE,
  COURSE_IMAGE_MAX_BYTES,
} from "@/lib/course-images";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function ensureCourseImageBucket() {
  const admin = createSupabaseAdminClient();
  const { error: getError } = await admin.storage.getBucket(
    COURSE_IMAGE_BUCKET,
  );

  if (!getError) {
    await admin.storage.updateBucket(COURSE_IMAGE_BUCKET, {
      public: true,
      fileSizeLimit: COURSE_IMAGE_MAX_BYTES,
      allowedMimeTypes: COURSE_IMAGE_ACCEPTED_TYPES,
    });
    return admin;
  }

  const { error: createError } = await admin.storage.createBucket(
    COURSE_IMAGE_BUCKET,
    {
      public: true,
      fileSizeLimit: COURSE_IMAGE_MAX_BYTES,
      allowedMimeTypes: COURSE_IMAGE_ACCEPTED_TYPES,
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

  const { data: managerRole } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .in("role", ["admin", "physiotherapy"])
    .maybeSingle();

  if (!managerRole) {
    return NextResponse.json(
      {
        error:
          "Nur Administrator:innen und Physiotherapie duerfen Kursbilder hochladen.",
      },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Bild fehlt." }, { status: 400 });
  }

  if (!COURSE_IMAGE_ACCEPTED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Bitte ein Bild im Format JPG, PNG, WebP oder GIF auswählen." },
      { status: 400 },
    );
  }

  if (file.size > COURSE_IMAGE_MAX_BYTES) {
    return NextResponse.json(
      { error: "Das Bild darf maximal 5 MB groß sein." },
      { status: 400 },
    );
  }

  try {
    admin = await ensureCourseImageBucket();
    const extension = COURSE_IMAGE_EXTENSION_BY_TYPE[file.type] ?? "jpg";
    const filePath = `courses/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage
      .from(COURSE_IMAGE_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        contentType: file.type,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const {
      data: { publicUrl },
    } = admin.storage.from(COURSE_IMAGE_BUCKET).getPublicUrl(filePath);

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
