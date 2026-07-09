import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/app-url";
import type { Database } from "@/lib/database.types";
import { formatDateTime } from "@/lib/format";
import {
  getResendDefaultFrom,
  hasResendDefaultFrom,
  hasResendEnv,
  sendEmail,
} from "@/lib/resend";
import { normalizeCalendarSettings } from "@/lib/calendar-settings";

type AdminClient = SupabaseClient<Database>;
type CalendarEvent = Database["public"]["Tables"]["calendar_events"]["Row"];
type AppRole = Database["public"]["Enums"]["app_role"];

export type CalendarReminderResult = {
  sent: boolean;
  eventCount: number;
  recipientCount: number;
  skippedReason?: string;
  error?: string;
};

const maxRecipientsPerEmail = 50;
const reminderRoles: AppRole[] = ["admin", "employee"];

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

function eventPreview(event: CalendarEvent) {
  const text = (event.description ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= 360) return text;
  return `${text.slice(0, 360).trim()}...`;
}

async function calendarReminderRecipients(admin: AdminClient) {
  const { data: roleRows, error: roleError } = await admin
    .from("user_roles")
    .select("user_id")
    .in("role", reminderRoles);

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

function buildCalendarReminderEmail({
  event,
  recipientCount,
}: {
  event: CalendarEvent;
  recipientCount: number;
}) {
  const calendarUrl = appUrl("/calendar");
  const preview = eventPreview(event);
  const timeLabel = event.all_day
    ? `${formatDateTime(event.start_time).split(",")[0]} · ganztags`
    : `${formatDateTime(event.start_time)} bis ${formatDateTime(event.end_time)}`;
  const subject = `Kleine Erinnerung: ${event.title}`;
  const escapedTitle = escapeHtml(event.title);
  const escapedTimeLabel = escapeHtml(timeLabel);
  const escapedLocation = event.location ? escapeHtml(event.location) : "";
  const escapedPreview = escapeHtml(preview);
  const escapedCalendarUrl = escapeHtml(calendarUrl);
  const escapedLogoUrl = escapeHtml(appUrl("/ullis-logo.png"));

  const html = `
    <div style="margin:0;padding:0;background:#f5f7f6;font-family:Arial,sans-serif;color:#24312f;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7f6;padding:32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #dce5e1;border-radius:14px;overflow:hidden;">
              <tr>
                <td style="padding:28px 28px 22px;">
                  <img src="${escapedLogoUrl}" width="56" height="56" alt="Ullis Pflegeteam" style="display:block;border-radius:50%;background:#fff;margin-bottom:20px;" />
                  <p style="margin:0 0 8px;color:#0f766e;font-size:13px;font-weight:700;letter-spacing:.02em;">Ullis Connect</p>
                  <h1 style="margin:0;color:#17312d;font-size:26px;line-height:1.25;">Kleine Erinnerung an einen bevorstehenden Termin</h1>
                  <p style="margin:16px 0 0;color:#52635f;font-size:16px;line-height:1.6;">Im Kalender steht bald ein Teamtermin an.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0 28px 24px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dce5e1;border-radius:12px;background:#f8fbfa;">
                    <tr>
                      <td style="padding:20px;">
                        <p style="margin:0 0 8px;color:#0f766e;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">Bevorstehender Termin</p>
                        <h2 style="margin:0;color:#17312d;font-size:21px;line-height:1.3;">${escapedTitle}</h2>
                        <p style="margin:14px 0 0;color:#52635f;font-size:15px;line-height:1.65;"><strong>Zeit:</strong> ${escapedTimeLabel}</p>
                        ${
                          escapedLocation
                            ? `<p style="margin:8px 0 0;color:#52635f;font-size:15px;line-height:1.65;"><strong>Ort:</strong> ${escapedLocation}</p>`
                            : ""
                        }
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
                  <a href="${escapedCalendarUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:8px;padding:13px 18px;font-size:15px;font-weight:700;">Zum Kalender</a>
                  <p style="margin:22px 0 0;color:#667772;font-size:13px;line-height:1.6;">Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:</p>
                  <p style="margin:8px 0 0;word-break:break-all;color:#0f766e;font-size:13px;line-height:1.6;">${escapedCalendarUrl}</p>
                </td>
              </tr>
              <tr>
                <td style="background:#eef5f2;padding:18px 28px;color:#667772;font-size:13px;line-height:1.55;">Diese Terminerinnerung wurde über Ullis Connect versendet. Empfängerkreis: ${recipientCount} Mitarbeiter:innen und Admins.</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
  const text = [
    "Kleine Erinnerung an einen bevorstehenden Termin",
    "",
    event.title,
    `Zeit: ${timeLabel}`,
    event.location ? `Ort: ${event.location}` : "",
    preview,
    "",
    `Zum Kalender: ${calendarUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

async function sendCalendarEventReminder({
  event,
  recipients,
}: {
  event: CalendarEvent;
  recipients: string[];
}) {
  const template = buildCalendarReminderEmail({
    event,
    recipientCount: recipients.length,
  });

  for (const recipientChunk of chunks(recipients, maxRecipientsPerEmail)) {
    const response = await sendEmail({
      from: getResendDefaultFrom(),
      to: recipientChunk,
      ...template,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }
  }
}

export async function sendDueCalendarReminders(
  admin: AdminClient,
): Promise<CalendarReminderResult> {
  const { data: settingsRow, error: settingsError } = await admin
    .from("calendar_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  if (settingsError) {
    return {
      sent: false,
      eventCount: 0,
      recipientCount: 0,
      error: settingsError.message,
    };
  }

  const settings = normalizeCalendarSettings(settingsRow);

  if (!settings.email_reminders_enabled) {
    return {
      sent: false,
      eventCount: 0,
      recipientCount: 0,
      skippedReason: "Kalender-Erinnerungen sind deaktiviert.",
    };
  }

  if (!hasResendEnv || !hasResendDefaultFrom) {
    return {
      sent: false,
      eventCount: 0,
      recipientCount: 0,
      skippedReason:
        "RESEND_API_KEY oder RESEND_FROM_EMAIL ist nicht konfiguriert.",
    };
  }

  const { recipients, error: recipientError } =
    await calendarReminderRecipients(admin);

  if (recipientError) {
    return {
      sent: false,
      eventCount: 0,
      recipientCount: 0,
      error: recipientError,
    };
  }

  if (recipients.length === 0) {
    return {
      sent: false,
      eventCount: 0,
      recipientCount: 0,
      skippedReason:
        "Es sind keine Mitarbeiter- oder Admin-E-Mail-Adressen hinterlegt.",
    };
  }

  const now = new Date();
  const reminderLimit = new Date(now);
  reminderLimit.setDate(now.getDate() + settings.reminder_days_before);

  const { data: events, error: eventsError } = await admin
    .from("calendar_events")
    .select("*")
    .is("reminder_sent_at", null)
    .gte("start_time", now.toISOString())
    .lte("start_time", reminderLimit.toISOString())
    .order("start_time", { ascending: true });

  if (eventsError) {
    return {
      sent: false,
      eventCount: 0,
      recipientCount: recipients.length,
      error: eventsError.message,
    };
  }

  if (!events?.length) {
    return {
      sent: false,
      eventCount: 0,
      recipientCount: recipients.length,
      skippedReason: "Keine fälligen Kalender-Erinnerungen gefunden.",
    };
  }

  let sentEvents = 0;

  for (const event of events) {
    await sendCalendarEventReminder({ event, recipients });
    sentEvents += 1;

    await admin
      .from("calendar_events")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", event.id);
  }

  return {
    sent: sentEvents > 0,
    eventCount: sentEvents,
    recipientCount: recipients.length,
  };
}
