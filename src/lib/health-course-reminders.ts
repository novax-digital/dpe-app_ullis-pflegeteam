import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/app-url";
import type { Database } from "@/lib/database.types";
import { formatDate, formatTime } from "@/lib/format";
import { normalizeHealthCourseSettings } from "@/lib/health-course-settings";
import {
  getResendDefaultFrom,
  hasResendDefaultFrom,
  hasResendEnv,
  sendEmail,
} from "@/lib/resend";

type AdminClient = SupabaseClient<Database>;
type HealthCourse = Database["public"]["Tables"]["health_courses"]["Row"];

export type HealthCourseReminderResult = {
  sent: boolean;
  courseCount: number;
  recipientCount: number;
  skippedReason?: string;
  error?: string;
};

const maxRecipientsPerEmail = 50;

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

function coursePreview(course: HealthCourse) {
  const text = (course.description?.trim() || course.notes?.trim() || "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= 360) return text;
  return `${text.slice(0, 360).trim()}...`;
}

function courseTimeLabel(course: HealthCourse) {
  return `${formatDate(course.start_time)} · ${formatTime(
    course.start_time,
  )}-${formatTime(course.end_time)}`;
}

async function courseReminderRecipients(admin: AdminClient, courseId: string) {
  const { data: registrations, error: registrationError } = await admin
    .from("course_registrations")
    .select("user_id")
    .eq("course_id", courseId)
    .eq("status", "registered");

  if (registrationError) {
    return { recipients: [], error: registrationError.message };
  }

  const userIds = Array.from(
    new Set((registrations ?? []).map((registration) => registration.user_id)),
  );

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

function buildHealthCourseReminderEmail({
  course,
  recipientCount,
}: {
  course: HealthCourse;
  recipientCount: number;
}) {
  const courseUrl = appUrl("/health-courses/uebersicht");
  const preview = coursePreview(course);
  const timeLabel = courseTimeLabel(course);
  const subject = `Kleine Erinnerung: ${course.title}`;
  const escapedTitle = escapeHtml(course.title);
  const escapedCategory = course.category ? escapeHtml(course.category) : "";
  const escapedLocation = course.location ? escapeHtml(course.location) : "";
  const escapedPreview = escapeHtml(preview);
  const escapedTimeLabel = escapeHtml(timeLabel);
  const escapedCourseUrl = escapeHtml(courseUrl);
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
                  <h1 style="margin:0;color:#17312d;font-size:26px;line-height:1.25;">Kleine Erinnerung an deinen bevorstehenden Kurs</h1>
                  <p style="margin:16px 0 0;color:#52635f;font-size:16px;line-height:1.6;">Du bist für einen Gesundheitskurs eingetragen, der bald stattfindet.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0 28px 24px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dce5e1;border-radius:12px;background:#f8fbfa;">
                    <tr>
                      <td style="padding:20px;">
                        <p style="margin:0 0 8px;color:#0f766e;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">Bevorstehender Gesundheitskurs</p>
                        <h2 style="margin:0;color:#17312d;font-size:21px;line-height:1.3;">${escapedTitle}</h2>
                        ${
                          escapedCategory
                            ? `<p style="margin:8px 0 0;color:#0f766e;font-size:14px;font-weight:700;line-height:1.5;">${escapedCategory}</p>`
                            : ""
                        }
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
                  <a href="${escapedCourseUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:8px;padding:13px 18px;font-size:15px;font-weight:700;">Kursübersicht öffnen</a>
                  <p style="margin:22px 0 0;color:#667772;font-size:13px;line-height:1.6;">Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:</p>
                  <p style="margin:8px 0 0;word-break:break-all;color:#0f766e;font-size:13px;line-height:1.6;">${escapedCourseUrl}</p>
                </td>
              </tr>
              <tr>
                <td style="background:#eef5f2;padding:18px 28px;color:#667772;font-size:13px;line-height:1.55;">Diese Kurserinnerung wurde über Ullis Connect versendet. Empfängerkreis: ${recipientCount} eingetragene Teilnehmer:innen.</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
  const text = [
    "Kleine Erinnerung an deinen bevorstehenden Kurs",
    "",
    course.title,
    course.category ? `Kategorie: ${course.category}` : "",
    `Zeit: ${timeLabel}`,
    course.location ? `Ort: ${course.location}` : "",
    preview,
    "",
    `Kursübersicht: ${courseUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

async function sendHealthCourseReminder({
  course,
  recipients,
}: {
  course: HealthCourse;
  recipients: string[];
}) {
  const template = buildHealthCourseReminderEmail({
    course,
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

export async function sendDueHealthCourseReminders(
  admin: AdminClient,
): Promise<HealthCourseReminderResult> {
  const { data: settingsRow, error: settingsError } = await admin
    .from("health_course_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  if (settingsError) {
    return {
      sent: false,
      courseCount: 0,
      recipientCount: 0,
      error: settingsError.message,
    };
  }

  const settings = normalizeHealthCourseSettings(settingsRow);

  if (!settings.email_reminders_enabled) {
    return {
      sent: false,
      courseCount: 0,
      recipientCount: 0,
      skippedReason: "Kurs-Erinnerungen sind deaktiviert.",
    };
  }

  if (!hasResendEnv || !hasResendDefaultFrom) {
    return {
      sent: false,
      courseCount: 0,
      recipientCount: 0,
      skippedReason:
        "RESEND_API_KEY oder RESEND_FROM_EMAIL ist nicht konfiguriert.",
    };
  }

  const now = new Date();
  const reminderLimit = new Date(now);
  reminderLimit.setDate(now.getDate() + settings.reminder_days_before);

  const { data: courses, error: coursesError } = await admin
    .from("health_courses")
    .select("*")
    .is("reminder_sent_at", null)
    .gte("start_time", now.toISOString())
    .lte("start_time", reminderLimit.toISOString())
    .in("status", ["available", "full"])
    .order("start_time", { ascending: true });

  if (coursesError) {
    return {
      sent: false,
      courseCount: 0,
      recipientCount: 0,
      error: coursesError.message,
    };
  }

  if (!courses?.length) {
    return {
      sent: false,
      courseCount: 0,
      recipientCount: 0,
      skippedReason: "Keine fälligen Kurs-Erinnerungen gefunden.",
    };
  }

  let sentCourses = 0;
  let totalRecipients = 0;

  for (const course of courses) {
    const { recipients, error } = await courseReminderRecipients(
      admin,
      course.id,
    );

    if (error) {
      return {
        sent: false,
        courseCount: sentCourses,
        recipientCount: totalRecipients,
        error,
      };
    }

    if (recipients.length === 0) {
      continue;
    }

    try {
      await sendHealthCourseReminder({ course, recipients });
    } catch (error) {
      return {
        sent: false,
        courseCount: sentCourses,
        recipientCount: totalRecipients,
        error:
          error instanceof Error
            ? error.message
            : "Die Kurs-Erinnerung konnte nicht versendet werden.",
      };
    }

    sentCourses += 1;
    totalRecipients += recipients.length;

    await admin
      .from("health_courses")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", course.id);
  }

  if (sentCourses === 0) {
    return {
      sent: false,
      courseCount: 0,
      recipientCount: 0,
      skippedReason:
        "Keine fälligen Kurs-Erinnerungen mit eingetragenen Empfänger:innen gefunden.",
    };
  }

  return {
    sent: true,
    courseCount: sentCourses,
    recipientCount: totalRecipients,
  };
}
