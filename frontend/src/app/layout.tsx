import type { Metadata } from "next";
import { PreferencesProvider } from "@/components/preferences-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "PENTA OFFICE",
  description: "PENTA WORKS 사내 업무 포털",
  manifest: "/favicon/site.webmanifest",
  icons: {
    icon: [{ url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" }],
    apple: "/favicon/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko" suppressHydrationWarning><body><PreferencesProvider>{children}</PreferencesProvider></body></html>;
}
