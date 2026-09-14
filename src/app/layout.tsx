import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "好日子 · 婚礼筹备地图",
  description: "一起把婚礼的每个想法，变成完成的小事。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
