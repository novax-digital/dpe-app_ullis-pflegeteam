import "server-only";

import sharp from "sharp";

export const OPTIMIZED_IMAGE_CONTENT_TYPE = "image/webp";
export const OPTIMIZED_IMAGE_EXTENSION = "webp";

type OptimizeUploadedImageOptions = {
  file: File;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
};

export async function optimizeUploadedImage({
  file,
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 78,
}: OptimizeUploadedImageOptions) {
  const input = Buffer.from(await file.arrayBuffer());

  const output = await sharp(input, {
    limitInputPixels: 48_000_000,
  })
    .rotate()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality,
      effort: 4,
    })
    .toBuffer();

  return {
    blob: new Blob([output], { type: OPTIMIZED_IMAGE_CONTENT_TYPE }),
    contentType: OPTIMIZED_IMAGE_CONTENT_TYPE,
    extension: OPTIMIZED_IMAGE_EXTENSION,
    originalBytes: file.size,
    optimizedBytes: output.byteLength,
  };
}
