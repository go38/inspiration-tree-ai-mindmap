import { notFound } from "next/navigation";
import MindMapStudio from "../MindMapStudio";
import { autoLayoutNodes, type NodeItem } from "../lib/mindmap";

function benchmarkNodes(size: number): NodeItem[] {
  const nodes: NodeItem[] = [{
    id: 1,
    parent: null,
    text: `${size} 節點效能基準`,
    note: "僅供本機開發量測",
    x: 420,
    y: 300,
    tone: "ink",
  }];
  const branchCount = Math.min(12, Math.max(6, Math.floor(size / 25)));
  for (let id = 2; id <= size; id++) {
    nodes.push({
      id,
      parent: id <= branchCount + 1 ? 1 : 2 + ((id - branchCount - 2) % branchCount),
      text: id % 17 === 0 ? `關鍵搜尋節點 ${id}` : `效能節點 ${id}`,
      note: `第 ${id} 個節點的說明文字`,
      x: 420,
      y: 300,
      tone: id % 3 === 0 ? "sage" : id % 3 === 1 ? "sun" : "coral",
    });
  }
  return autoLayoutNodes(nodes);
}

export default async function PerformanceBenchmarkPage({
  searchParams,
}: {
  searchParams: Promise<{ nodes?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const requested = Number.parseInt((await searchParams).nodes ?? "500", 10);
  const size = [100, 300, 500].includes(requested) ? requested : 500;
  const nodes = benchmarkNodes(size);
  return <MindMapStudio initialNodes={nodes} initialSelectedId={1} persistence={{ mode: "local" }} />;
}
