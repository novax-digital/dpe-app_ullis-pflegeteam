import { AuthPasswordActionPage } from "@/components/auth-password-action-page";

export const dynamic = "force-dynamic";

export default function PasswordResetPage() {
  return <AuthPasswordActionPage type="recovery" />;
}
