export const workshopStatuses: Record<string, string> = {
  IN_PROGRESS: "수리 중",
  TEST_REQUIRED: "테스트 필요",
  TEST_FAILED: "테스트 실패",
  COMPLETED: "수리 완료",
};

export const defaultWorkshopStatus = "IN_PROGRESS";

export function workshopStatus(status: string): string {
  return status === "RECEIVED" ? defaultWorkshopStatus : status;
}

export function workshopStatusLabel(status: string): string {
  return workshopStatuses[workshopStatus(status)] ?? status;
}

export type WorkshopRepairRow = {
  id: number;
  equipment_name: string;
  hospital_name: string | null;
  description_markdown: string;
  status: string;
  work_date: string;
  author_id: number;
  author_name: string;
};

type WorkshopRepairUnit = {
  unit_no: number;
  serial_number: string | null;
  status: string;
  fault_axis: string | null;
  test_result: string | null;
};

type RepairAttachment = { id: number; original_name: string };
type RepairPhoto = RepairAttachment & { width_px?: number; height_px?: number };

export type WorkshopRepairDetail = WorkshopRepairRow & {
  units: WorkshopRepairUnit[];
  files: RepairAttachment[];
  photos: RepairPhoto[];
  workshop_photos: RepairPhoto[];
};
