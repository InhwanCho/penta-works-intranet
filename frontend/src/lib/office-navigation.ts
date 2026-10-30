import { BookOpenText, BarChart3, CalendarDays, CreditCard, Home, Landmark, Megaphone, NotebookTabs, ReceiptText, Users, WalletCards, type LucideIcon } from "lucide-react";

export type OfficeSection = "home" | "notices" | "meetings" | "hospitals" | "workshop-repairs" | "work-logs" | "manuals" | "schedules" | "accounting";
// List, detail and writing screens share the same labels, order and icons.
export const officeNavigation: { id: OfficeSection; href: string; label: string; icon: LucideIcon }[] = [
  { id: "home", href: "/", label: "대시보드", icon: Home },
  { id: "notices", href: "/notices", label: "공지사항", icon: Megaphone },
  { id: "meetings", href: "/meetings", label: "주간 회의록", icon: NotebookTabs },
  { id: "manuals", href: "/manuals", label: "업무 매뉴얼", icon: BookOpenText },
  { id: "schedules", href: "/schedules", label: "일정", icon: CalendarDays },
  { id: "accounting", href: "/accounting", label: "회계", icon: WalletCards },
];

export const accountingNavigation = [
  { href: "/accounting", label: "계좌내역", icon: Landmark },
  { href: "/accounting/cards", label: "카드내역", icon: CreditCard },
  { href: "/accounting/tax-invoices", label: "세금계산서", icon: ReceiptText },
  { href: "/accounting/cash", label: "자금계획", icon: WalletCards },
  { href: "/accounting/receivables", label: "매출·수금", icon: ReceiptText },
  { href: "/accounting/expenses", label: "지출·미지급금", icon: ReceiptText },
  { href: "/accounting/payroll", label: "급여", icon: Users },
  { href: "/accounting/profit", label: "목표·손익", icon: BarChart3 },
];
