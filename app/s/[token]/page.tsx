import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "../../../db";
import { mindMaps, shareLinks } from "../../../db/schema";
import MindMapStudio from "../../MindMapStudio";
import { isShareToken } from "../../lib/shareAccess";
import { parseMapData } from "../../lib/sharedMap";

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

export default async function SharedAccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isShareToken(token)) return <Notice title="分享連結無效" detail="請向地圖擁有者索取新的分享網址。" />;
  try {
    const db = getDb();
    const [result] = await db
      .select({ map: mindMaps, link: shareLinks })
      .from(shareLinks)
      .innerJoin(mindMaps, eq(shareLinks.mapId, mindMaps.id))
      .where(and(eq(shareLinks.token, token), eq(shareLinks.active, true)))
      .limit(1);
    if (!result) return <Notice title="分享連結已失效" detail="擁有者可能已停止分享或重新產生連結。" />;
    const nodes = parseMapData(result.map.data);
    if (!nodes) return <Notice title="心智圖資料毀損" detail="這張地圖的內容目前無法解析。" />;
    const root = nodes.find((node) => node.parent === null) ?? nodes[0];
    return (
      <MindMapStudio
        initialNodes={nodes}
        initialSelectedId={root.id}
        persistence={{
          mode: "cloud",
          mapId: result.map.id,
          version: result.map.version,
          title: result.map.title,
          access: result.link.permission,
          shareToken: result.link.token,
        }}
      />
    );
  } catch {
    return <Notice title="無法載入共享地圖" detail="資料庫暫時無法連線，請稍後再試。" />;
  }
}
