import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AppRole } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/auth";
import { emailAppUrl } from "@/lib/app-url";
import { getResendDefaultFrom, sendEmail } from "@/lib/resend";

type AuthEmailKind = "invite" | "recovery";

const AUTH_ACTION_VALIDITY_MS = 72 * 60 * 60 * 1000;

type AuthActionPayload = {
  email: string;
  expiresAt: number;
  nonce: string;
  type: AuthEmailKind;
};

function authActionSecret() {
  const secret =
    process.env.AUTH_ACTION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("AUTH_ACTION_SECRET ist nicht konfiguriert.");
  return secret;
}

function sign(payload: string) {
  return createHmac("sha256", authActionSecret()).update(payload).digest("base64url");
}

export function createAuthActionToken(email: string, type: AuthEmailKind) {
  const payload: AuthActionPayload = {
    email: email.trim().toLowerCase(),
    expiresAt: Date.now() + AUTH_ACTION_VALIDITY_MS,
    nonce: randomBytes(16).toString("base64url"),
    type,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyAuthActionToken(
  token: string,
  expectedType: AuthEmailKind,
) {
  const [encoded, providedSignature, ...rest] = token.split(".");
  if (!encoded || !providedSignature || rest.length) return null;

  const expectedSignature = sign(encoded);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as AuthActionPayload;
    if (
      payload.type !== expectedType ||
      !payload.email ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt < Date.now()
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function authActionUrl({
  actionToken,
  type,
}: {
  actionToken: string;
  type: AuthEmailKind;
}) {
  const pathname = type === "invite" ? "/einladung" : "/passwort-zuruecksetzen";
  const url = new URL(emailAppUrl(pathname));
  url.searchParams.set("action_token", actionToken);
  url.searchParams.set("type", type);
  return url.toString();
}

function authEmailTemplate({
  title,
  intro,
  buttonLabel,
  actionUrl,
  footer,
}: {
  title: string;
  intro: string;
  buttonLabel: string;
  actionUrl: string;
  footer: string;
}) {
  const logoUrl = emailAppUrl("/ullis-logo.png");
  const escapedTitle = escapeHtml(title);
  const escapedIntro = escapeHtml(intro);
  const escapedFooter = escapeHtml(footer);
  const escapedButtonLabel = escapeHtml(buttonLabel);
  const escapedActionUrl = escapeHtml(actionUrl);
  const escapedLogoUrl = escapeHtml(logoUrl);

  const html = `
    <div style="margin:0;padding:0;background:#f5f7f6;font-family:Arial,sans-serif;color:#24312f;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7f6;padding:32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dce5e1;border-radius:14px;overflow:hidden;">
              <tr>
                <td style="padding:28px 28px 20px;">
                  <img src="${escapedLogoUrl}" width="56" height="56" alt="Ullis Pflegeteam" style="display:block;border-radius:50%;background:#fff;margin-bottom:20px;" />
                  <p style="margin:0 0 8px;color:#0f766e;font-size:13px;font-weight:700;letter-spacing:.02em;">Ullis Connect</p>
                  <h1 style="margin:0;color:#17312d;font-size:26px;line-height:1.25;">${escapedTitle}</h1>
                  <p style="margin:16px 0 0;color:#52635f;font-size:16px;line-height:1.6;">${escapedIntro}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:4px 28px 28px;">
                  <a href="${escapedActionUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:8px;padding:13px 18px;font-size:15px;font-weight:700;">${escapedButtonLabel}</a>
                  <p style="margin:22px 0 0;color:#667772;font-size:13px;line-height:1.6;">Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:</p>
                  <p style="margin:8px 0 0;word-break:break-all;color:#0f766e;font-size:13px;line-height:1.6;">${escapedActionUrl}</p>
                </td>
              </tr>
              <tr>
                <td style="background:#eef5f2;padding:18px 28px;color:#667772;font-size:13px;line-height:1.55;">${escapedFooter}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  const text = [
    title,
    "",
    intro,
    "",
    `${buttonLabel}: ${actionUrl}`,
    "",
    footer,
  ].join("\n");

  return { html, text };
}

export async function sendInviteEmail({
  email,
  fullName,
  role,
}: {
  email: string;
  fullName: string;
  role: AppRole;
}) {
  const actionUrl = authActionUrl({
    actionToken: createAuthActionToken(email, "invite"),
    type: "invite",
  });
  const recipientName = fullName.trim() || email;
  const template = authEmailTemplate({
    title: "Willkommen bei Ullis Connect",
    intro: `Hallo ${recipientName}, dein Konto wurde angelegt. Richte jetzt dein Passwort ein und melde dich anschließend im Mitarbeiterportal an. Deine Rolle: ${ROLE_LABEL[role]}.`,
    buttonLabel: "Passwort einrichten",
    actionUrl,
    footer:
      "Dieser Einladungslink ist 72 Stunden gültig und nur für dich bestimmt. Wenn du diese Einladung nicht erwartet hast, ignoriere diese E-Mail bitte.",
  });

  const response = await sendEmail({
    from: getResendDefaultFrom(),
    to: email,
    subject: "Einladung zu Ullis Connect",
    ...template,
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return { actionUrl };
}

export async function sendPasswordResetEmail({
  email,
}: {
  email: string;
}) {
  const actionUrl = authActionUrl({
    actionToken: createAuthActionToken(email, "recovery"),
    type: "recovery",
  });
  const template = authEmailTemplate({
    title: "Passwort zurücksetzen",
    intro:
      "Du hast eine Zurücksetzung deines Passworts angefordert. Öffne den Link und vergib ein neues Passwort für Ullis Connect.",
    buttonLabel: "Passwort zurücksetzen",
    actionUrl,
    footer:
      "Dieser Link ist 72 Stunden gültig. Wenn du keine Passwort-Zurücksetzung angefordert hast, kannst du diese E-Mail ignorieren.",
  });

  const response = await sendEmail({
    from: getResendDefaultFrom(),
    to: email,
    subject: "Passwort für Ullis Connect zurücksetzen",
    ...template,
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return { actionUrl };
}
