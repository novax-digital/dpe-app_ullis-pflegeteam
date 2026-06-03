import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getUserContext } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const { user } = await getUserContext();

  if (user) {
    redirect("/");
  }

  return <LoginForm />;
}
