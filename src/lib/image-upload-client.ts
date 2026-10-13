import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const extensionByMimeType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function uploadImageDirectly({
  supabase,
  bucket,
  folder,
  file,
}: {
  supabase: SupabaseClient<Database>;
  bucket: string;
  folder: string;
  file: File;
}) {
  const fileExtension =
    extensionByMimeType[file.type] ??
    file.name.split(".").pop()?.toLocaleLowerCase("de") ??
    "bin";
  const filePath = `${folder}/${crypto.randomUUID()}.${fileExtension}`;
  const { error } = await supabase.storage.from(bucket).upload(filePath, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });

  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(filePath);

  return publicUrl;
}
