import { NextResponse } from "next/server";
import { sendDueHealthCourseReminders } from "@/lib/health-course-reminders";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function isAuthorized(request: Request) {
  const cronSecret =
    process.env.CRON_SECRET?.trim() || process.env.VERCEL_CRON_SECRET?.trim();
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  const explicitSecret = request.headers.get("x-cron-secret")?.trim();

  if (cronSecret && (bearer === cronSecret || explicitSecret === cronSecret)) {
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  return Boolean(data);
}

async function handleHealthCourseReminderRequest(request: Request) {
  if (!hasSupabaseEnv) {
    return errorResponse("Supabase ist noch nicht konfiguriert.", 503);
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    return errorResponse((error as Error).message, 500);
  }

  if (!(await isAuthorized(request))) {
    return errorResponse("Nicht berechtigt.", 401);
  }

  const result = await sendDueHealthCourseReminders(admin);

  if (result.error) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return handleHealthCourseReminderRequest(request);
}

export async function POST(request: Request) {
  return handleHealthCourseReminderRequest(request);
}
