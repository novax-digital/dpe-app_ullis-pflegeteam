import { redirect } from "next/navigation";

export default async function PinboardDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  redirect(`/nachrichten/${id}`);
}
