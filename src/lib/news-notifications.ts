import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { emailAppUrl } from "@/lib/app-url";
import type { Database } from "@/lib/database.types";
import {
  getResendDefaultFrom,
  hasResendDefaultFrom,
  hasResendEnv,
  sendEmail,
} from "@/lib/resend";

type AdminClient = SupabaseClient<Database>;
type NewsItem = Database["public"]["Tables"]["news"]["Row"];
type AppRole = Database["public"]["Enums"]["app_role"];

export type NewsNotificationResult = {
  sent: boolean;
  recipientCount: number;
  skippedReason?: string;
  error?: string;
};

const maxRecipientsPerEmail = 50;
const notificationRoles: AppRole[] = ["admin", "employee", "physiotherapy"];

function messageUrl(item: NewsItem) {
  try {
    return emailAppUrl(`/nachrichten/${item.id}`);
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

function plainPreview(item: NewsItem) {
  const text = (item.excerpt?.trim() || item.content || "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= 420) return text;
  return `${text.slice(0, 420).trim()}...`;
}

function validEmail(value: string | null | undefined) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function normalizeRecipients(emails: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      emails
        .map((email) => email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email && validEmail(email))),
    ),
  );
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function employeeRecipients(admin: AdminClient) {
  const { data: roleRows, error: roleError } = await admin
    .from("user_roles")
    .select("user_id")
    .in("role", notificationRoles);

  if (roleError) {
    return { recipients: [], error: roleError.message };
  }

  const userIds = Array.from(new Set((roleRows ?? []).map((row) => row.user_id)));
  if (userIds.length === 0) {
    return { recipients: [] };
  }

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("email")
    .in("id", userIds);

  if (error) {
    return { recipients: [], error: error.message };
  }

  return {
    recipients: normalizeRecipients((profiles ?? []).map((profile) => profile.email)),
  };
}

export function buildNewsNotificationEmail({
  item,
  author,
  recipientCount,
  recipientList,
  testMode = false,
}: {
  item: NewsItem;
  author: string;
  recipientCount?: number;
  recipientList?: string[];
  testMode?: boolean;
}) {
  const url = messageUrl(item);
  const preview = plainPreview(item);
  const subjectPrefix = testMode ? "Test: " : "";
  const subject = `${subjectPrefix}Es gibt eine neue News: ${item.title}`;
  const escapedTitle = escapeHtml(item.title);
  const escapedAuthor = escapeHtml(author);
  const escapedPreview = escapeHtml(preview);
  const escapedUrl = url ? escapeHtml(url) : "";
  const logoUrl = escapeHtml(emailAppUrl("/ullis-logo.png"));
  const escapedRecipientList = recipientList?.length
    ? escapeHtml(recipientList.join(", "))
    : "";
  const recipientSummary =
    typeof recipientCount === "number"
      ? `${recipientCount} Empfänger:innen`
      : "Ullis Team";

  const html = `
    <div style="margin:0;padding:0;background:#f5f7f6;font-family:Arial,sans-serif;color:#24312f;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7f6;padding:32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #dce5e1;border-radius:14px;overflow:hidden;">
              <tr>
                <td style="padding:28px 28px 22px;">
                  <img src="${logoUrl}" width="56" height="56" alt="Ullis Pflegeteam" style="display:block;border-radius:50%;background:#fff;margin-bottom:20px;" />
                  <p style="margin:0 0 8px;color:#0f766e;font-size:13px;font-weight:700;letter-spacing:.02em;">Ullis Connect</p>
                  <h1 style="margin:0;color:#17312d;font-size:26px;line-height:1.25;">Es gibt eine neue News</h1>
                  <p style="margin:16px 0 0;color:#52635f;font-size:16px;line-height:1.6;">${escapedAuthor} hat eine neue Nachricht im Mitarbeiterportal veröffentlicht.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0 28px 24px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dce5e1;border-radius:12px;background:#f8fbfa;">
                    <tr>
                      <td style="padding:20px;">
                        <p style="margin:0 0 8px;color:#0f766e;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">Neue News</p>
                        <h2 style="margin:0;color:#17312d;font-size:21px;line-height:1.3;">${escapedTitle}</h2>
                        ${
                          escapedPreview
                            ? `<p style="margin:14px 0 0;color:#52635f;font-size:15px;line-height:1.65;">${escapedPreview}</p>`
                            : ""
                        }
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:0 28px 28px;">
                  ${
                    escapedUrl
                      ? `<a href="${escapedUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:8px;padding:13px 18px;font-size:15px;font-weight:700;">Jetzt lesen</a>
                         <p style="margin:22px 0 0;color:#667772;font-size:13px;line-height:1.6;">Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:</p>
                         <p style="margin:8px 0 0;word-break:break-all;color:#0f766e;font-size:13px;line-height:1.6;">${escapedUrl}</p>`
                      : `<p style="margin:0;color:#667772;font-size:14px;line-height:1.6;">Öffne Ullis Connect, um die News zu lesen.</p>`
                  }
                </td>
              </tr>
              ${
                testMode && escapedRecipientList
                  ? `<tr>
                      <td style="padding:0 28px 24px;">
                        <div style="border:1px dashed #b7cac4;border-radius:10px;padding:14px;color:#52635f;font-size:13px;line-height:1.6;">
                          <strong style="color:#17312d;">Testempfänger-Liste aus der Datenbank:</strong><br />
                          ${escapedRecipientList}
                        </div>
                      </td>
                    </tr>`
                  : ""
              }
              <tr>
                <td style="background:#eef5f2;padding:18px 28px;color:#667772;font-size:13px;line-height:1.55;">Diese Benachrichtigung wurde über Ullis Connect versendet. Empfängerkreis: ${escapeHtml(recipientSummary)}.</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
  const text = [
    testMode ? "TEST: Es gibt eine neue News" : "Es gibt eine neue News",
    "",
    `${author} hat eine neue Nachricht im Mitarbeiterportal veröffentlicht.`,
    "",
    item.title,
    preview,
    url ? `\nJetzt lesen: ${url}` : "",
    recipientList?.length
      ? `\nTestempfänger-Liste aus der Datenbank:\n${recipientList.join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

export async function sendAdminNewsNotification({
  admin,
  item,
  author,
  overrideRecipients,
  includeRecipientList = false,
  testMode = false,
}: {
  admin: AdminClient;
  item: NewsItem;
  author: string;
  overrideRecipients?: string[];
  includeRecipientList?: boolean;
  testMode?: boolean;
}): Promise<NewsNotificationResult> {
  if (!hasResendEnv || !hasResendDefaultFrom) {
    return {
      sent: false,
      recipientCount: 0,
      skippedReason:
        "RESEND_API_KEY oder RESEND_FROM_EMAIL ist nicht konfiguriert.",
    };
  }

  const { recipients: employeeEmails, error } = await employeeRecipients(admin);
  if (error) {
    return {
      sent: false,
      recipientCount: 0,
      error,
    };
  }

  const recipients = overrideRecipients?.length
    ? normalizeRecipients(overrideRecipients)
    : employeeEmails;

  if (recipients.length === 0) {
    return {
      sent: false,
      recipientCount: 0,
      skippedReason: "Es sind keine Mitarbeiter-E-Mail-Adressen hinterlegt.",
    };
  }

  const template = buildNewsNotificationEmail({
    item,
    author,
    recipientCount: employeeEmails.length,
    recipientList: includeRecipientList ? employeeEmails : undefined,
    testMode,
  });

  for (const recipientChunk of chunks(recipients, maxRecipientsPerEmail)) {
    const response = await sendEmail({
      from: getResendDefaultFrom(),
      to: recipientChunk,
      ...template,
    });

    if (response.error) {
      return {
        sent: false,
        recipientCount: recipients.length,
        error: response.error.message,
      };
    }
  }

  return {
    sent: true,
    recipientCount: recipients.length,
  };
}

export async function notifyAdminNewsIfNeeded({
  admin,
  item,
  author,
  authorIsAdmin,
  requested,
}: {
  admin: AdminClient;
  item: NewsItem;
  author: string;
  authorIsAdmin: boolean;
  requested: boolean;
}): Promise<NewsNotificationResult> {
  if (!requested) {
    return {
      sent: false,
      recipientCount: 0,
      skippedReason: "Die E-Mail-Benachrichtigung wurde nicht angefordert.",
    };
  }

  if (!authorIsAdmin) {
    return {
      sent: false,
      recipientCount: 0,
      skippedReason: "Die Nachricht wurde nicht von einem Admin verfasst.",
    };
  }

  if (!item.published) {
    return {
      sent: false,
      recipientCount: 0,
      skippedReason: "Die Nachricht ist nicht veröffentlicht.",
    };
  }

  if (item.notification_sent_at) {
    return {
      sent: false,
      recipientCount: 0,
      skippedReason: "Die Benachrichtigung wurde bereits versendet.",
    };
  }

  const result = await sendAdminNewsNotification({ admin, item, author });

  if (result.sent) {
    await admin
      .from("news")
      .update({ notification_sent_at: new Date().toISOString() })
      .eq("id", item.id);
  }

  return result;
}
