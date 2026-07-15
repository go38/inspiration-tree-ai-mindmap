"use client";

import MindMapStudio from "./MindMapStudio";
import { initialNodes } from "./lib/sampleMap";

// Local mode: personal draft backed by localStorage, with a "建立共享連結"
// action that promotes the current map to a shared cloud copy.
export default function Home() {
  return <MindMapStudio initialNodes={initialNodes} initialSelectedId={1} persistence={{ mode: "local" }} />;
}
