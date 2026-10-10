import { redirect } from "next/navigation";

export default async function PlatformSupportTicketRedirect({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  redirect(`/platform/support-tickets?ticketId=${encodeURIComponent(ticketId)}`);
}
