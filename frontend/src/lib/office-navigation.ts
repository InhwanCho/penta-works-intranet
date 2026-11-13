import { Wrench, BookOpenText, CreditCard, Home, Landmark, Megaphone, NotebookTabs, ReceiptText, ListChecks, WalletCards, type LucideIcon } from "lucide-react";

export type OfficeSection = "home" | "notices" | "meetings" | "hospitals" | "workshop-repairs" | "work-logs" | "manuals" | "schedules" | "accounting";
// List, detail and writing screens share the same labels, order and icons.
export const officeNavigation: { id: OfficeSection; href: string; label: string; icon: LucideIcon }[] = [
  { id: "home", href: "/", label: "업무 홈", icon: Home },
  { id: "notices", href: "/notices", label: "공지사항", icon: Megaphone },
  { id: "meetings", href: "/meetings", label: "주간 회의록", icon: NotebookTabs },
  { id: "workshop-repairs", href: "/workshop-repairs", label: "수리 기록", icon: Wrench },
  { id: "manuals", href: "/manuals", label: "업무 매뉴얼", icon: BookOpenText },
  { id: "accounting", href: "/accounting", label: "회계", icon: WalletCards },
];

export const accountingNavigation = [
  { href: "/accounting", label: "대시보드", icon: WalletCards },
  { href: "/accounting/plans", label: "입출금 계획", icon: ListChecks },
  { href: "/accounting/review", label: "입출금 확인", icon: ListChecks },
  { href: "/accounting/banks", label: "은행거래", icon: Landmark },
  { href: "/accounting/cards", label: "카드내역", icon: CreditCard },
  { href: "/accounting/card-bills", label: "카드 결제예정", icon: ReceiptText },
  { href: "/accounting/ledger", label: "거래처 원장 · 부가세", icon: BookOpenText },
  { href: "/accounting/tax-invoices", label: "세금계산서", icon: ReceiptText },
];
