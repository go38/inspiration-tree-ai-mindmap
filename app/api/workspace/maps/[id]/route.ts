import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { mindMaps } from "../../../../../db/schema";
import { parseMapData } from "../../../../lib/sharedMap";
import { normalizeOwnerEmail, parseWorkspaceMapPatch } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function ownerFromRequest(request: Request): string | null {
  return normalizeOwnerEmail(request.headers.get("oai-authenticated-user-email"));
}

// PATCH /api/workspace/maps/:id — rename, archive, or restore an owned map.
export async function PATCH(request: Request, context: RouteContext) {
  const ownerEmail = ownerFromRequest(request);
  if (!ownerEmail) return Response.json({ error: "請先登入 ChatGPT" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = parseWorkspaceMapPatch(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    const { id } = await context.params;
    const now = new Date().toISOString();
    const values: Partial<typeof mindMaps.$inferInsert> = {
      updatedAt: now,
      updatedBy: ownerEmail,
    };
    if (parsed.value.title !== undefined) values.title = parsed.value.title;
    if (parsed.value.archived !== undefined) values.archivedAt = parsed.value.archived ? now : null;

    const updated = await getDb()
      .update(mindMaps)
      .set(values)
      .where(and(eq(mindMaps.id, id), eq(mindMaps.ownerEmail, ownerEmail)))
      .returning();
    const row = updated[0];
    if (!row) return Response.json({ error: "找不到這張個人地圖" }, { status: 404 });

    return Response.json({
      map: {
        id: row.id,
        title: row.title,
        version: row.version,
        updatedAt: row.updatedAt,
        archivedAt: row.archivedAt,
        nodeCount: parseMapData(row.data)?.length ?? 0,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "無法更新個人地圖" },
      { status: 500 },
    );
  }
}
