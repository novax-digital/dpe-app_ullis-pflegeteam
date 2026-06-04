export const COURSE_IMAGE_BUCKET = "course-images";
export const COURSE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const COURSE_IMAGE_ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export const COURSE_IMAGE_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
