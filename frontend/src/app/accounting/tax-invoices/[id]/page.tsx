import { notFound } from "next/navigation";
import PortalPage from "@/components/portal-page";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  return <PortalPage />;
}
