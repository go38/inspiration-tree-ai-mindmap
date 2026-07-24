import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "../../db";
import { mindMaps } from "../../db/schema";
import { requireChatGPTUser } from "../chatgpt-auth";
import { parseMapData } from "../lib/sharedMap";
import { normalizeOwnerEmail, type WorkspaceMapSummary } from "../lib/workspace";
import MapWorkspace from "./MapWorkspace";

export const dynamic = "force-dynamic";

export default async function PersonalMapsPage() {
  const user = await requireChatGPTUser("/maps");
  const ownerEmail = normalizeOwnerEmail(user.email);
  if (!ownerEmail) return null;

  let maps: WorkspaceMapSummary[];
  try {
    const rows = await getDb()
      .select()
      .from(mindMaps)
      .where(eq(mindMaps.ownerEmail, ownerEmail))
      .orderBy(desc(mindMaps.updatedAt));
    maps = rows.map((row) => ({
      id: row.id,
      title: row.title,
      version: row.version,
      updatedAt: row.updatedAt,
      archivedAt: row.archivedAt,
      nodeCount: parseMapData(row.data)?.length ?? 0,
    }));
  } catch {
    return (
      <main className="workspace-page">
        <section className="workspace-notice">
          <h1>暫時無法載入個人地圖</h1>
          <p>資料庫目前沒有回應，請稍後再試。你的既有地圖不會因此消失。</p>
          <Link href="/">回到工作室</Link>
        </section>
      </main>
    );
  }

  return <MapWorkspace initialMaps={maps} displayName={user.displayName} />;
}
