import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AFOCS SKD",
  description: "AFOCS 엑셀 기반 월간 근무 캘린더·통계·S근무 제안",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
