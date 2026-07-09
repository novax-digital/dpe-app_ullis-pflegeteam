import { AccessDenied } from "@/components/access-denied";
import { SettingsPage } from "@/components/settings-page";
import { getUserContext } from "@/lib/auth-server";
import {
  normalizeNewsSettings,
  type NewsSettings,
} from "@/lib/news-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsMessagesRoute() {
  const { roles } = await getUserContext();

  if (!roles.includes("admin")) {
    return <AccessDenied />;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("news_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  const newsSettings: NewsSettings = normalizeNewsSettings(data);

  return (
    <SettingsPage
      mode="messages"
      isAdmin
      initialNewsSettings={newsSettings}
    />
  );
}
