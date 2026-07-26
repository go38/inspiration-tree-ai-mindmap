import { autoLayoutNodes, collectSubtreeIds, nextNodeId, type NodeItem } from "./mindmap.ts";

export type BranchTemplate = {
  id: string;
  title: string;
  description: string;
  nodes: { key: string; parentKey: string | null; text: string; note: string; tone: NodeItem["tone"] }[];
};

export const BRANCH_TEMPLATES: BranchTemplate[] = [
  {
    id: "smart-goal",
    title: "SMART 目標",
    description: "把目標拆成具體、可衡量、可達成、相關與有期限的檢查點。",
    nodes: [
      { key: "root", parentKey: null, text: "SMART 目標", note: "用五個條件把方向變成可執行目標", tone: "coral" },
      { key: "s", parentKey: "root", text: "具體 Specific", note: "要完成什麼？對誰有價值？", tone: "sage" },
      { key: "m", parentKey: "root", text: "可衡量 Measurable", note: "用什麼數字或證據判斷進展？", tone: "sun" },
      { key: "a", parentKey: "root", text: "可達成 Achievable", note: "現有資源與限制是什麼？", tone: "coral" },
      { key: "r", parentKey: "root", text: "相關 Relevant", note: "為什麼現在值得投入？", tone: "sage" },
      { key: "t", parentKey: "root", text: "有期限 Time-bound", note: "期限與檢查點是什麼？", tone: "sun" },
    ],
  },
  {
    id: "decision",
    title: "決策分析",
    description: "快速整理選項、準則、風險與下一步。",
    nodes: [
      { key: "root", parentKey: null, text: "決策分析", note: "先寫清楚要做的決定", tone: "sun" },
      { key: "options", parentKey: "root", text: "可選方案", note: "列出至少三個可行方案", tone: "coral" },
      { key: "criteria", parentKey: "root", text: "評估準則", note: "成本、效益、時間與可逆性", tone: "sage" },
      { key: "risks", parentKey: "root", text: "風險與假設", note: "哪些條件若不成立會改變決定？", tone: "sun" },
      { key: "next", parentKey: "root", text: "最小下一步", note: "用低成本實驗取得更多資訊", tone: "coral" },
    ],
  },
  {
    id: "weekly-review",
    title: "每週回顧",
    description: "用固定結構回顧成果、阻力、學習與下週重點。",
    nodes: [
      { key: "root", parentKey: null, text: "每週回顧", note: "固定時間整理一週並選定下週重點", tone: "sage" },
      { key: "wins", parentKey: "root", text: "完成與亮點", note: "哪些進展值得保留？", tone: "sun" },
      { key: "blocks", parentKey: "root", text: "阻力與未完成", note: "卡在哪裡？需要誰或什麼資源？", tone: "coral" },
      { key: "learn", parentKey: "root", text: "學到什麼", note: "哪些假設被證實或推翻？", tone: "sage" },
      { key: "focus", parentKey: "root", text: "下週三件事", note: "選出最重要且可完成的三項成果", tone: "sun" },
    ],
  },
];

export function duplicateBranch(nodes: NodeItem[], rootId: number): { nodes: NodeItem[]; rootId: number } | null {
  const root = nodes.find((node) => node.id === rootId);
  if (!root || root.parent === null) return null;
  const sourceIds = collectSubtreeIds(nodes, rootId);
  const sources = nodes.filter((node) => sourceIds.has(node.id));
  const firstId = nextNodeId(nodes);
  const idMap = new Map(sources.map((node, index) => [node.id, firstId + index]));
  const copies = sources.map((node): NodeItem => ({
    ...node,
    id: idMap.get(node.id)!,
    parent: node.id === rootId ? root.parent : idMap.get(node.parent!)!,
    text: node.id === rootId ? `${node.text}（複本）` : node.text,
    x: node.x + 36,
    y: node.y + 36,
  }));
  return { nodes: autoLayoutNodes([...nodes, ...copies]), rootId: firstId };
}

export function applyBranchTemplate(
  nodes: NodeItem[],
  parentId: number,
  template: BranchTemplate,
): { nodes: NodeItem[]; rootId: number } | null {
  if (!nodes.some((node) => node.id === parentId) || template.nodes.length === 0) return null;
  const firstId = nextNodeId(nodes);
  const idByKey = new Map(template.nodes.map((node, index) => [node.key, firstId + index]));
  const created = template.nodes.map((node): NodeItem => ({
    id: idByKey.get(node.key)!,
    parent: node.parentKey === null ? parentId : (idByKey.get(node.parentKey) ?? parentId),
    text: node.text,
    note: node.note,
    x: 0,
    y: 0,
    tone: node.tone,
  }));
  return { nodes: autoLayoutNodes([...nodes, ...created]), rootId: firstId };
}
