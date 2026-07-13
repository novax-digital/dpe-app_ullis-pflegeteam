import "server-only";

export const EMAIL_APP_BASE_URL = "https://connect.ullis-pflegeteam.de";

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

/** Public URLs embedded in emails must never point to a Vercel preview. */
export function emailAppUrl(path: string) {
  return new URL(path, EMAIL_APP_BASE_URL).toString();
}
