import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/admin-api";
import { CUSTOM_PAGE_FILE_BUCKET } from "@/lib/custom-pages";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(
      { error: "Supabase ist noch nicht konfiguriert." },
      { status: 503 },
    );
  }

  const auth = await requireApiAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const { data: file } = await auth.admin
    .from("custom_page_files")
    .select("file_path")
    .eq("id", id)
    .maybeSingle();
  if (!file) {
    return NextResponse.json(
      { error: "PDF wurde nicht gefunden." },
      { status: 404 },
    );
  }

  const { error: storageError } = await auth.admin.storage
    .from(CUSTOM_PAGE_FILE_BUCKET)
    .remove([file.file_path]);
  if (storageError) {
    return NextResponse.json(
      { error: storageError.message },
      { status: 400 },
    );
  }

  const { error } = await auth.admin
    .from("custom_page_files")
    .delete()
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
