import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "../../../../db";
import { mindMaps, shareLinks } from "../../../../db/schema";
import {
  nextVersion,
  parseMapData,
  parseUpdatePayload,
  serializeMapData,
} from "../../../lib/sharedMap";
import { canAccessMap, normalizeOwnerEmail } from "../../../lib/workspace";
import { isShareToken, sharePermissionCanEdit } from "../../../lib/shareAccess";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function toRouteErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const detail = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  if (`${message}\n${detail}`.includes("no such table")) {
    return "心智圖資料表尚未建立。請在本機執行 `npm run db:generate` 產生 migration，再部署讓平台套用到真正的 D1。";
  }
  return message;
}

type MapRow = typeof mindMaps.$inferSelect;

/** Shape returned to the client. Returns null when the stored data is corrupt. */
function toMapResponse(row: MapRow) {
  const nodes = parseMapData(row.data);
  if (!nodes) return null;
  return {
    id: row.id,
    title: row.title,
    nodes,
    version: row.version,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

async function activeShare(id: string, token: string | null) {
  if (!isShareToken(token)) return null;
  const [link] = await getDb()
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.mapId, id), eq(shareLinks.token, token), eq(shareLinks.active, true)))
    .limit(1);
  return link ?? null;
}

// GET /api/maps/:id — load a shared map.
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const db = getDb();
    const [row] = await db.select().from(mindMaps).where(eq(mindMaps.id, id)).limit(1);
    if (!row) return Response.json({ error: "找不到這張心智圖" }, { status: 404 });
    const viewerEmail = normalizeOwnerEmail(_request.headers.get("oai-authenticated-user-email"));
    const link = await activeShare(id, _request.headers.get("x-share-token"));
    if (!canAccessMap(row.ownerEmail, viewerEmail) && !link) {
      return Response.json({ error: "找不到這張心智圖" }, { status: 404 });
    }

    const map = toMapResponse(row);
    if (!map) return Response.json({ error: "心智圖資料毀損" }, { status: 500 });
    return Response.json({ ...map, access: canAccessMap(row.ownerEmail, viewerEmail) ? "owner" : link?.permission });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

// PUT /api/maps/:id — save, guarded by the client's base version.
export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = parseUpdatePayload(body);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

    const db = getDb();
    const now = new Date().toISOString();
    const updatedBy = request.headers.get("oai-authenticated-user-email");
    const viewerEmail = normalizeOwnerEmail(updatedBy);
    const newVersion = nextVersion(parsed.value.version);
    const link = await activeShare(id, request.headers.get("x-share-token"));
    const ownerWrite = viewerEmail
      ? or(isNull(mindMaps.ownerEmail), eq(mindMaps.ownerEmail, viewerEmail))
      : isNull(mindMaps.ownerEmail);
    const sharedWrite = link && sharePermissionCanEdit(link.permission) ? eq(mindMaps.id, id) : undefined;
    const ownership = sharedWrite ? or(ownerWrite, sharedWrite) : ownerWrite;

    // Conditional write: only succeeds if the row still holds the base version
    // the client edited. RETURNING lets us detect a race atomically.
    const updated = await db
      .update(mindMaps)
      .set({
        title: parsed.value.title,
        data: serializeMapData(parsed.value.nodes),
        version: newVersion,
        updatedAt: now,
        updatedBy,
      })
      .where(and(eq(mindMaps.id, id), eq(mindMaps.version, parsed.value.version), ownership))
      .returning();

    if (updated.length === 1) {
      return Response.json({ id, version: newVersion, updatedAt: now });
    }

    // No row updated: either it doesn't exist (404) or the version moved on (409).
    const [row] = await db.select().from(mindMaps).where(eq(mindMaps.id, id)).limit(1);
    if (!row) return Response.json({ error: "找不到這張心智圖" }, { status: 404 });
    if (!canAccessMap(row.ownerEmail, viewerEmail) && !link) {
      return Response.json({ error: "找不到這張心智圖" }, { status: 404 });
    }
    if (link && !sharePermissionCanEdit(link.permission) && !canAccessMap(row.ownerEmail, viewerEmail)) {
      return Response.json({ error: "這個分享連結沒有編輯權限" }, { status: 403 });
    }

    const current = toMapResponse(row);
    return Response.json(
      { error: "conflict", message: "有人剛更新了這張圖", current },
      { status: 409 },
    );
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
