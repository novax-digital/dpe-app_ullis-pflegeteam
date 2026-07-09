import "server-only";

export function getAppBaseUrl() {
  const explicitUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (explicitUrl) return explicitUrl.replace(/\/+$/, "");

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;

  return "http://localhost:3000";
}

export function appUrl(path: string) {
  return new URL(path, getAppBaseUrl()).toString();
}
