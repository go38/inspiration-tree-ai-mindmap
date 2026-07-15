import type { NodeItem } from "./mindmap";

// The default sample map shown on the local home page and used by "reset".
export const initialNodes: NodeItem[] = [
  { id: 1, parent: null, text: "打造理想生活", note: "從真正重要的事開始", x: 420, y: 300, tone: "ink" },
  { id: 2, parent: 1, text: "身心健康", note: "每天保留恢復能量的空間", x: 130, y: 125, tone: "coral" },
  { id: 3, parent: 1, text: "創意工作", note: "讓好奇心帶路", x: 720, y: 115, tone: "sage" },
  { id: 4, parent: 1, text: "關係與連結", note: "主動創造深度相處", x: 120, y: 500, tone: "sun" },
  { id: 5, parent: 1, text: "持續學習", note: "每季探索一個新領域", x: 730, y: 500, tone: "coral" },
  { id: 6, parent: 2, text: "晨間散步", note: "20 分鐘，不帶手機", x: 22, y: 25, tone: "coral" },
  { id: 7, parent: 3, text: "每週創作", note: "完成比完美重要", x: 920, y: 25, tone: "sage" },
];
