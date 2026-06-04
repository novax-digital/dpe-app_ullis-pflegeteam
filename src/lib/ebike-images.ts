export const EBIKE_IMAGE_BUCKET = "ebike-images";
export const EBIKE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const EBIKE_IMAGE_ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export const EBIKE_IMAGE_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
