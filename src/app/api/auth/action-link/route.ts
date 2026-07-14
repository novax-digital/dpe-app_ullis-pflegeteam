import { NextResponse } from "next/server";
import { emailAppUrl } from "@/lib/app-url";
import { verifyAuthActionToken } from "@/lib/auth-emails";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";

const actionTypes = ["invite", "recovery"] as const;
type ActionType = (typeof actionTypes)[number];

export async function POST(request: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(
      { error: "Supabase ist noch nicht konfiguriert." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const type = String(body.type ?? "") as ActionType;
  if (!actionTypes.includes(type)) {
    return NextResponse.json({ error: "Ungültiger Linktyp." }, { status: 400 });
  }

  const payload = verifyAuthActionToken(token, type);
  if (!payload) {
    return NextResponse.json(
      { error: "Der Link ist ungültig oder abgelaufen." },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type,
    email: payload.email,
    options: {
      redirectTo: emailAppUrl(
        type === "invite" ? "/einladung" : "/passwort-zuruecksetzen",
      ),
    },
  });

  if (error || !data.properties?.hashed_token) {
    return NextResponse.json(
      { error: "Der sichere Link konnte nicht geöffnet werden." },
      { status: 400 },
    );
  }

  return NextResponse.json({ token_hash: data.properties.hashed_token });
}
