import { notFound } from "next/navigation";
import WorkshopRepairRecord from "@/components/workshop-repair-record";

export default async function EditWorkshopRepairPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  return <WorkshopRepairRecord id={id} edit />;
}
