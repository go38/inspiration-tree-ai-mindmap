import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "靈感樹｜AI 心智圖工作室",
  description: "自由繪製想法，讓 AI 陪你延伸節點、拆解問題並找到更多可能。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
