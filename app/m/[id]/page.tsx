import { eq } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "../../../db";
import { mindMaps } from "../../../db/schema";
import { parseMapData } from "../../lib/sharedMap";
import { getChatGPTUser } from "../../chatgpt-auth";
import { canAccessMap, normalizeOwnerEmail } from "../../lib/workspace";
import MindMapStudio from "../../MindMapStudio";

export const dynamic = "force-dynamic";

function Notice({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="app-shell notice-shell">
      <div className="notice-card">
        <h1>{title}</h1>
        <p>{detail}</p>
        <Link className="share-button" href="/">回到工作室</Link>
      </div>
    </main>
  );
}

export default async function SharedMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let row: typeof mindMaps.$inferSelect | undefined;
  try {
    const db = getDb();
    [row] = await db.select().from(mindMaps).where(eq(mindMaps.id, id)).limit(1);
  } catch {
    return <Notice title="無法載入共享地圖" detail="資料庫暫時無法連線，請稍後再試。" />;
  }

  if (!row) {
    return <Notice title="找不到這張心智圖" detail="連結可能已失效，或這張地圖尚未建立。" />;
  }

  const user = await getChatGPTUser();
  if (!canAccessMap(row.ownerEmail, normalizeOwnerEmail(user?.email))) {
    return <Notice title="找不到這張心智圖" detail="這張個人地圖不屬於目前登入的帳號。" />;
  }

  const nodes = parseMapData(row.data);
  if (!nodes) {
    return <Notice title="心智圖資料毀損" detail="這張地圖的內容無法解析。" />;
  }

  const roots = nodes.filter((node) => node.parent === null);
  return (
    <MindMapStudio
      initialNodes={nodes}
      initialSelectedId={roots[0]?.id ?? nodes[0].id}
      persistence={{ mode: "cloud", mapId: row.id, version: row.version, title: row.title, personal: row.ownerEmail !== null }}
      showWorkspaceLink={user !== null}
    />
  );
}
