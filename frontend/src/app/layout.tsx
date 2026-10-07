import type { Metadata } from "next";
import { PreferencesProvider } from "@/components/preferences-provider";
import "./globals.css";
import "./accessibility.css";
import "./office-theme.css";
import { QueryProvider } from "@/components/query-provider";
import OfficeFrame from "@/components/office-frame";

export const metadata: Metadata = {
  title: "PENTA OFFICE",
  description: "PENTA WORKS 사내 업무 포털",
  robots: { index: false, follow: false },
  manifest: "/favicon/site.webmanifest",
  icons: {
    icon: [{ url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" }],
    apple: "/favicon/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko" data-theme="light" suppressHydrationWarning><body><QueryProvider><PreferencesProvider><OfficeFrame>{children}</OfficeFrame></PreferencesProvider></QueryProvider></body></html>;
}
