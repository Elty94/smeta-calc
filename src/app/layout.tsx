import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Калькулятор рентабельности",
  description: "Быстрая оценка рентабельности строительных проектов",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
