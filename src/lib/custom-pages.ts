export const CUSTOM_PAGE_FILE_BUCKET = "custom-page-files";
export const CUSTOM_PAGE_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const CUSTOM_PAGE_FILE_ACCEPTED_TYPES = ["application/pdf"];

export function customPageSlug(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("de")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isPdfFile(file: File) {
  return (
    CUSTOM_PAGE_FILE_ACCEPTED_TYPES.includes(file.type) ||
    file.name.toLocaleLowerCase("de").endsWith(".pdf")
  );
}
