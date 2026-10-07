import { BookOpenText, Building2, CalendarDays, ClipboardList, Home, Megaphone, NotebookTabs, WalletCards, Wrench, type LucideIcon } from "lucide-react";

export type OfficeSection = "home" | "notices" | "meetings" | "hospitals" | "workshop-repairs" | "work-logs" | "manuals" | "schedules" | "accounting";
// List, detail and writing screens share the same labels, order and icons.
export const officeNavigation: { id: OfficeSection; href: string; label: string; icon: LucideIcon }[] = [
  { id: "home", href: "/", label: "대시보드", icon: Home },
  { id: "notices", href: "/notices", label: "공지사항", icon: Megaphone },
  { id: "meetings", href: "/meetings", label: "주간 회의록", icon: NotebookTabs },
  { id: "hospitals", href: "/hospitals", label: "병원·장비", icon: Building2 },
  { id: "workshop-repairs", href: "/workshop-repairs", label: "수리 기록", icon: Wrench },
  { id: "work-logs", href: "/work-logs", label: "업무일지", icon: ClipboardList },
  { id: "manuals", href: "/manuals", label: "업무 매뉴얼", icon: BookOpenText },
  { id: "schedules", href: "/schedules", label: "일정", icon: CalendarDays },
  { id: "accounting", href: "/accounting", label: "회계", icon: WalletCards },
];
