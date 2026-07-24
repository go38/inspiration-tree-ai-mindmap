import { and, desc, eq, isNotNull, isNull, like } from "drizzle-orm";
import { getDb } from "../../../../db";
import { mindMaps } from "../../../../db/schema";
import { parseMapData, serializeMapData } from "../../../lib/sharedMap";
import {
  createPersonalMapNodes,
  duplicateMapTitle,
  normalizeOwnerEmail,
  normalizeWorkspaceSearch,
  parseWorkspaceMapCreate,
} from "../../../lib/workspace";

export const dynamic = "force-dynamic";

function generateMapId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function ownerFromRequest(request: Request): string | null {
  return normalizeOwnerEmail(request.headers.get("oai-authenticated-user-email"));
}

function mapSummary(row: typeof mindMaps.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    version: row.version,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
    nodeCount: parseMapData(row.data)?.length ?? 0,
  };
}

// GET /api/workspace/maps?q=&archived=true — current user's maps, newest first.
export async function GET(request: Request) {
  const ownerEmail = ownerFromRequest(request);
  if (!ownerEmail) return Response.json({ error: "請先登入 ChatGPT" }, { status: 401 });

  try {
    const url = new URL(request.url);
    const search = normalizeWorkspaceSearch(url.searchParams.get("q"));
    const showArchived = url.searchParams.get("archived") === "true";
    const filters = [
      eq(mindMaps.ownerEmail, ownerEmail),
      showArchived ? isNotNull(mindMaps.archivedAt) : isNull(mindMaps.archivedAt),
    ];
    if (search) filters.push(like(mindMaps.title, `%${search}%`));

    const rows = await getDb()
      .select()
      .from(mindMaps)
      .where(and(...filters))
      .orderBy(desc(mindMaps.updatedAt));
    return Response.json({ maps: rows.map(mapSummary) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "無法載入個人地圖" },
      { status: 500 },
    );
  }
}

// POST /api/workspace/maps — create a blank map, or duplicate an owned map.
export async function POST(request: Request) {
  const ownerEmail = ownerFromRequest(request);
  if (!ownerEmail) return Response.json({ error: "請先登入 ChatGPT" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = parseWorkspaceMapCreate(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    const db = getDb();
    let title = parsed.value.title;
    let nodes = createPersonalMapNodes(title);
    if (parsed.value.sourceMapId) {
      const [source] = await db
        .select()
        .from(mindMaps)
        .where(and(eq(mindMaps.id, parsed.value.sourceMapId), eq(mindMaps.ownerEmail, ownerEmail)))
        .limit(1);
      if (!source) return Response.json({ error: "找不到可複製的地圖" }, { status: 404 });
      const sourceNodes = parseMapData(source.data);
      if (!sourceNodes) return Response.json({ error: "來源地圖資料毀損" }, { status: 500 });
      title = duplicateMapTitle(source.title);
      nodes = sourceNodes;
    }

    const id = generateMapId();
    const now = new Date().toISOString();
    await db.insert(mindMaps).values({
      id,
      title,
      data: serializeMapData(nodes),
      version: 1,
      ownerEmail,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      updatedBy: ownerEmail,
    });

    return Response.json(
      { map: { id, title, version: 1, updatedAt: now, archivedAt: null, nodeCount: nodes.length } },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "無法建立個人地圖" },
      { status: 500 },
    );
  }
}
