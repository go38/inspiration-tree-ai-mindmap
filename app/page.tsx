import MindMapStudio from "./MindMapStudio";
import { getChatGPTUser } from "./chatgpt-auth";
import { initialNodes } from "./lib/sampleMap";

// Local mode: personal draft backed by localStorage, with a "建立共享連結"
// action that promotes the current map to a shared cloud copy. Rendering on the
// server only reads the identity header — the studio itself stays a client
// component — so hosts without ChatGPT sign-in never show a workspace link that
// would redirect into a route they do not serve.
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return (
    <MindMapStudio
      initialNodes={initialNodes}
      initialSelectedId={1}
      persistence={{ mode: "local" }}
      showWorkspaceLink={user !== null}
    />
  );
}
