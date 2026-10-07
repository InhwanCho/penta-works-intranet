import { redirect } from "next/navigation";
export default async function WorkshopDetail({ params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 redirect(`/workshop-repairs?record=${encodeURIComponent(id)}`);
}
