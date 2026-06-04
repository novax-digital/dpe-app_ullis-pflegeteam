import { NextResponse } from "next/server";
import { DOCUMENT_FILE_BUCKET } from "@/lib/document-files";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function attachmentFileName(fileName: string) {
  const fallback = fileName.replace(/[^\w.-]+/g, "_") || "dokument";
  const encoded = encodeURIComponent(fileName).replace(/['()]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
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

  const { data: documentItem, error: documentError } = await supabase
    .from("documents")
    .select("file_path, file_name, mime_type")
    .eq("id", id)
    .maybeSingle();

  if (documentError) {
    return NextResponse.json(
      { error: documentError.message },
      { status: 500 },
    );
  }

  if (!documentItem) {
    return NextResponse.json(
      { error: "Dokument wurde nicht gefunden." },
      { status: 404 },
    );
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from(DOCUMENT_FILE_BUCKET)
    .download(documentItem.file_path);

  if (downloadError || !fileBlob) {
    return NextResponse.json(
      {
        error:
          downloadError?.message ??
          "Das Dokument konnte nicht heruntergeladen werden.",
      },
      { status: 500 },
    );
  }

  return new Response(await fileBlob.arrayBuffer(), {
    headers: {
      "Content-Disposition": attachmentFileName(documentItem.file_name),
      "Content-Length": String(fileBlob.size),
      "Content-Type": documentItem.mime_type || "application/octet-stream",
    },
  });
}
