import { NextResponse } from "next/server";
import { CUSTOM_PAGE_FILE_BUCKET } from "@/lib/custom-pages";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function inlineFileName(fileName: string) {
  const fallback = fileName.replace(/[^\w.-]+/g, "_") || "dokument.pdf";
  const encoded = encodeURIComponent(fileName).replace(/['()]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  const { id } = await context.params;
  const { data: file } = await supabase
    .from("custom_page_files")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!file) {
    return NextResponse.json(
      { error: "PDF wurde nicht gefunden oder ist nicht freigegeben." },
      { status: 404 },
    );
  }

  const { data, error } = await supabase.storage
    .from(CUSTOM_PAGE_FILE_BUCKET)
    .download(file.file_path);
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "PDF konnte nicht geladen werden." },
      { status: 404 },
    );
  }

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": inlineFileName(file.file_name),
      "Cache-Control": "private, no-store",
    },
  });
}
