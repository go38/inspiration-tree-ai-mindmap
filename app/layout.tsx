import type { Metadata } from "next";
import { Geist, Noto_Serif_TC } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const serif = Noto_Serif_TC({ variable: "--font-serif", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "靈感樹｜AI 心智圖工作室",
  description: "自由繪製想法，讓 AI 陪你延伸節點、拆解問題並找到更多可能。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body className={`${sans.variable} ${serif.variable}`}>{children}</body></html>;
}
