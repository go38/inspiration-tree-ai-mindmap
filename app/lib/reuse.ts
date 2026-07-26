import { autoLayoutNodes, collectSubtreeIds, nextNodeId, type NodeItem } from "./mindmap.ts";

export type BranchTemplate = {
  id: string;
  title: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  author: string;
  featured?: boolean;
  icon: string;
  nodes: { key: string; parentKey: string | null; text: string; note: string; tone: NodeItem["tone"] }[];
};

export const TEMPLATE_CATEGORIES = ["全部", "目標", "專案", "教育", "研究", "行銷", "敏捷", "AI", "生活"] as const;
export type TemplateCategory = Exclude<(typeof TEMPLATE_CATEGORIES)[number], "全部">;

export const BRANCH_TEMPLATES: BranchTemplate[] = [
  {
    id: "smart-goal",
    title: "SMART 目標",
    description: "把目標拆成具體、可衡量、可達成、相關與有期限的檢查點。",
    category: "目標", tags: ["SMART", "目標", "規劃"], author: "靈感樹精選", featured: true, icon: "◎",
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
    category: "專案", tags: ["決策", "風險", "比較"], author: "靈感樹精選", featured: true, icon: "◇",
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
    category: "生活", tags: ["回顧", "生產力", "習慣"], author: "靈感樹精選", icon: "↻",
    nodes: [
      { key: "root", parentKey: null, text: "每週回顧", note: "固定時間整理一週並選定下週重點", tone: "sage" },
      { key: "wins", parentKey: "root", text: "完成與亮點", note: "哪些進展值得保留？", tone: "sun" },
      { key: "blocks", parentKey: "root", text: "阻力與未完成", note: "卡在哪裡？需要誰或什麼資源？", tone: "coral" },
      { key: "learn", parentKey: "root", text: "學到什麼", note: "哪些假設被證實或推翻？", tone: "sage" },
      { key: "focus", parentKey: "root", text: "下週三件事", note: "選出最重要且可完成的三項成果", tone: "sun" },
    ],
  },
  {
    id: "okr",
    title: "OKR 規劃",
    description: "從一個有方向感的目標，展開可衡量的關鍵結果與行動。",
    category: "目標", tags: ["OKR", "KPI", "績效"], author: "靈感樹精選", featured: true, icon: "◉",
    nodes: [
      { key: "root", parentKey: null, text: "Objective", note: "一句話描述希望帶來的改變", tone: "coral" },
      { key: "kr1", parentKey: "root", text: "KR 1｜成果指標", note: "可量化且有期限的結果", tone: "sage" },
      { key: "kr2", parentKey: "root", text: "KR 2｜品質指標", note: "避免只追求數量的品質護欄", tone: "sun" },
      { key: "kr3", parentKey: "root", text: "KR 3｜使用者價值", note: "能證明價值真的被感受到的訊號", tone: "coral" },
      { key: "actions", parentKey: "root", text: "本週行動", note: "推進關鍵結果的最小行動", tone: "sage" },
    ],
  },
  {
    id: "software-project",
    title: "軟體專案啟動",
    description: "整理使用者問題、範圍、技術、測試、風險與發布計畫。",
    category: "專案", tags: ["軟體", "開發", "產品"], author: "靈感樹精選", featured: true, icon: "⌘",
    nodes: [
      { key: "root", parentKey: null, text: "軟體專案", note: "先定義問題與成功畫面", tone: "ink" },
      { key: "users", parentKey: "root", text: "使用者與問題", note: "服務誰？目前最痛的是什麼？", tone: "coral" },
      { key: "scope", parentKey: "root", text: "功能與範圍", note: "本次要做與明確不做的內容", tone: "sage" },
      { key: "tech", parentKey: "root", text: "技術設計", note: "資料、介面、整合與安全", tone: "sun" },
      { key: "qa", parentKey: "root", text: "測試與驗收", note: "可重現的品質證據", tone: "coral" },
      { key: "release", parentKey: "root", text: "發布與風險", note: "上線、監控、回復與負責人", tone: "sage" },
    ],
  },
  {
    id: "course-design",
    title: "課程設計",
    description: "從學習成果反推單元、活動、評量與教材。",
    category: "教育", tags: ["教學", "課程", "學習"], author: "靈感樹精選", icon: "學",
    nodes: [
      { key: "root", parentKey: null, text: "課程設計", note: "以學習者最後能做到什麼為中心", tone: "ink" },
      { key: "learner", parentKey: "root", text: "學習者", note: "先備知識、動機與限制", tone: "coral" },
      { key: "outcomes", parentKey: "root", text: "學習成果", note: "可觀察、可評量的能力", tone: "sage" },
      { key: "units", parentKey: "root", text: "單元與順序", note: "由基礎到應用的學習路徑", tone: "sun" },
      { key: "activities", parentKey: "root", text: "活動與練習", note: "讓學習者實際操作與回饋", tone: "coral" },
      { key: "assessment", parentKey: "root", text: "評量", note: "如何證明成果已達成", tone: "sage" },
    ],
  },
  {
    id: "research-plan",
    title: "研究計畫",
    description: "建立研究問題、文獻、方法、分析與限制的完整骨架。",
    category: "研究", tags: ["論文", "研究", "文獻"], author: "靈感樹精選", featured: true, icon: "研",
    nodes: [
      { key: "root", parentKey: null, text: "研究計畫", note: "清楚描述要回答的問題", tone: "ink" },
      { key: "question", parentKey: "root", text: "研究問題", note: "範圍明確且可被證據回答", tone: "coral" },
      { key: "literature", parentKey: "root", text: "文獻與缺口", note: "既有發現與尚未解決之處", tone: "sage" },
      { key: "method", parentKey: "root", text: "研究方法", note: "樣本、資料、程序與倫理", tone: "sun" },
      { key: "analysis", parentKey: "root", text: "分析計畫", note: "如何從資料回答問題", tone: "coral" },
      { key: "limits", parentKey: "root", text: "限制與貢獻", note: "解釋邊界與可能價值", tone: "sage" },
    ],
  },
  {
    id: "marketing-campaign",
    title: "行銷活動",
    description: "從受眾洞察一路規劃訊息、渠道、內容與成效。",
    category: "行銷", tags: ["行銷", "活動", "內容"], author: "靈感樹精選", icon: "↗",
    nodes: [
      { key: "root", parentKey: null, text: "行銷活動", note: "先定義希望受眾採取的行動", tone: "ink" },
      { key: "audience", parentKey: "root", text: "目標受眾", note: "需求、情境與阻力", tone: "coral" },
      { key: "message", parentKey: "root", text: "核心訊息", note: "一句話價值主張與證據", tone: "sage" },
      { key: "channels", parentKey: "root", text: "渠道", note: "在正確時間與場景觸及受眾", tone: "sun" },
      { key: "content", parentKey: "root", text: "內容計畫", note: "主題、格式、節奏與負責人", tone: "coral" },
      { key: "metrics", parentKey: "root", text: "成效指標", note: "曝光、互動、轉換與留存", tone: "sage" },
    ],
  },
  {
    id: "scrum-sprint",
    title: "SCRUM Sprint",
    description: "整理 Sprint Goal、Backlog、責任、風險與回顧。",
    category: "敏捷", tags: ["SCRUM", "Sprint", "Agile"], author: "靈感樹精選", icon: "⚑",
    nodes: [
      { key: "root", parentKey: null, text: "Sprint", note: "固定週期交付一個可驗證增量", tone: "ink" },
      { key: "goal", parentKey: "root", text: "Sprint Goal", note: "本次衝刺要帶來的單一價值", tone: "coral" },
      { key: "backlog", parentKey: "root", text: "Sprint Backlog", note: "依價值與風險排序的工作", tone: "sage" },
      { key: "owners", parentKey: "root", text: "責任與協作", note: "負責人、依賴與溝通節點", tone: "sun" },
      { key: "risks", parentKey: "root", text: "阻礙與風險", note: "提早曝光並安排移除方式", tone: "coral" },
      { key: "review", parentKey: "root", text: "Review & Retro", note: "成果回饋與流程改善", tone: "sage" },
    ],
  },
  {
    id: "ai-prompt",
    title: "AI Prompt 設計",
    description: "用角色、任務、脈絡、限制、格式與範例建立可靠提示。",
    category: "AI", tags: ["AI", "Prompt", "Agent"], author: "靈感樹精選", featured: true, icon: "✦",
    nodes: [
      { key: "root", parentKey: null, text: "AI Prompt", note: "把期待的行為與輸出說清楚", tone: "ink" },
      { key: "role", parentKey: "root", text: "角色與目標", note: "AI 是誰？要幫誰完成什麼？", tone: "coral" },
      { key: "context", parentKey: "root", text: "必要脈絡", note: "完成任務所需且可信的資訊", tone: "sage" },
      { key: "constraints", parentKey: "root", text: "限制與安全", note: "不得做什麼、如何處理不確定", tone: "sun" },
      { key: "format", parentKey: "root", text: "輸出格式", note: "欄位、長度、語氣與驗證規則", tone: "coral" },
      { key: "examples", parentKey: "root", text: "範例與評估", note: "好壞範例及判斷品質的方法", tone: "sage" },
    ],
  },
  {
    id: "life-plan",
    title: "人生規劃",
    description: "從價值、健康、關係、工作、財務與成長看見整體生活。",
    category: "生活", tags: ["人生", "生活", "願景"], author: "靈感樹精選", icon: "樹",
    nodes: [
      { key: "root", parentKey: null, text: "人生規劃", note: "以真正重視的價值決定取捨", tone: "ink" },
      { key: "values", parentKey: "root", text: "價值與願景", note: "希望成為怎樣的人、過怎樣的生活", tone: "coral" },
      { key: "health", parentKey: "root", text: "身心健康", note: "能量、睡眠、運動與恢復", tone: "sage" },
      { key: "relations", parentKey: "root", text: "關係與家庭", note: "想投入與守護的重要關係", tone: "sun" },
      { key: "work", parentKey: "root", text: "工作與創造", note: "能力、貢獻與可持續節奏", tone: "coral" },
      { key: "growth", parentKey: "root", text: "財務與成長", note: "安全感、選擇權與持續學習", tone: "sage" },
    ],
  },
];

export function filterBranchTemplates(
  templates: BranchTemplate[],
  query: string,
  category: (typeof TEMPLATE_CATEGORIES)[number] = "全部",
): BranchTemplate[] {
  const normalized = query.trim().toLocaleLowerCase("zh-TW");
  return templates.filter((template) => {
    if (category !== "全部" && template.category !== category) return false;
    if (!normalized) return true;
    return [template.title, template.description, template.category, template.author, ...template.tags]
      .join(" ")
      .toLocaleLowerCase("zh-TW")
      .includes(normalized);
  });
}

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
