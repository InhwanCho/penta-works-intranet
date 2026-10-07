import { redirect } from "next/navigation";
export default async function WorkLogDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/work-logs?record=${encodeURIComponent(id)}`);
}
