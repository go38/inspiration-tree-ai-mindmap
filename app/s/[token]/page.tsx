import { eq } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "../../../db";
import { mindMaps, shareLinks } from "../../../db/schema";
import MindMapStudio from "../../MindMapStudio";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isShareToken, shareLinkState } from "../../lib/shareAccess";
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

  let result: { map: typeof mindMaps.$inferSelect; link: typeof shareLinks.$inferSelect } | undefined;
  try {
    const db = getDb();
    [result] = await db
      .select({ map: mindMaps, link: shareLinks })
      .from(shareLinks)
      .innerJoin(mindMaps, eq(shareLinks.mapId, mindMaps.id))
      .where(eq(shareLinks.token, token))
      .limit(1);
  } catch {
    return <Notice title="無法載入共享地圖" detail="資料庫暫時無法連線，請稍後再試。" />;
  }

  if (!result) return <Notice title="分享連結已失效" detail="擁有者可能已停止分享或重新產生連結。" />;
  // A token holder already proved they were given the link, so naming the
  // reason is more useful than a generic failure — and tells them what to ask
  // the owner for.
  const state = shareLinkState(result.link);
  if (state === "revoked") return <Notice title="分享連結已撤銷" detail="擁有者已永久停用這個網址，請向他索取新的分享連結。" />;
  if (state === "expired") return <Notice title="分享連結已到期" detail="這個網址已過擁有者設定的到期時間，請向他索取新的分享連結。" />;
  if (state === "disabled") return <Notice title="分享連結已關閉" detail="擁有者目前停止分享這張地圖。" />;
  const nodes = parseMapData(result.map.data);
  if (!nodes) return <Notice title="心智圖資料毀損" detail="這張地圖的內容目前無法解析。" />;
  const root = nodes.find((node) => node.parent === null) ?? nodes[0];
  const user = await getChatGPTUser();
  return (
    <MindMapStudio
      initialNodes={nodes}
      initialSelectedId={root.id}
      showWorkspaceLink={user !== null}
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
}
