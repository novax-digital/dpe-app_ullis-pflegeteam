import { redirect } from "next/navigation";

export default async function NewsDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  redirect(`/nachrichten/${id}`);
}
