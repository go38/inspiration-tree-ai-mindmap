import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { mindMaps, shareLinks } from "../../../../../db/schema";
import { parseShareLinkUpdate } from "../../../../lib/shareAccess";
import { normalizeOwnerEmail } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function ownerFromRequest(request: Request): string | null {
  return normalizeOwnerEmail(request.headers.get("oai-authenticated-user-email"));
}

function generateShareToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function shareResponse(link: typeof shareLinks.$inferSelect | undefined) {
  if (!link) return { share: null };
  return {
    share: {
      token: link.token,
      permission: link.permission,
      active: link.active,
      url: `/s/${link.token}`,
    },
  };
}

async function ownedMap(id: string, ownerEmail: string) {
  const [map] = await getDb()
    .select({ id: mindMaps.id })
    .from(mindMaps)
    .where(and(eq(mindMaps.id, id), eq(mindMaps.ownerEmail, ownerEmail)))
    .limit(1);
  return map;
}

// GET /api/maps/:id/share — owner-only current share configuration.
export async function GET(request: Request, context: RouteContext) {
  const ownerEmail = ownerFromRequest(request);
  if (!ownerEmail) return Response.json({ error: "請先登入 ChatGPT" }, { status: 401 });
  const { id } = await context.params;

  try {
    if (!await ownedMap(id, ownerEmail)) return Response.json({ error: "找不到這張個人地圖" }, { status: 404 });
    const [link] = await getDb().select().from(shareLinks).where(eq(shareLinks.mapId, id)).limit(1);
    return Response.json(shareResponse(link));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法讀取分享設定" }, { status: 500 });
  }
}

// PUT /api/maps/:id/share — owner-only enable, disable, change role, or rotate token.
export async function PUT(request: Request, context: RouteContext) {
  const ownerEmail = ownerFromRequest(request);
  if (!ownerEmail) return Response.json({ error: "請先登入 ChatGPT" }, { status: 401 });
  const parsed = parseShareLinkUpdate(await request.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const { id } = await context.params;

  try {
    if (!await ownedMap(id, ownerEmail)) return Response.json({ error: "找不到這張個人地圖" }, { status: 404 });
    const db = getDb();
    const [existing] = await db.select().from(shareLinks).where(eq(shareLinks.mapId, id)).limit(1);
    const now = new Date().toISOString();
    if (!existing || parsed.value.regenerate) {
      if (existing) await db.delete(shareLinks).where(eq(shareLinks.mapId, id));
      const token = generateShareToken();
      await db.insert(shareLinks).values({
        token,
        mapId: id,
        permission: parsed.value.permission,
        active: parsed.value.active,
        createdBy: ownerEmail,
        createdAt: now,
        updatedAt: now,
      });
      const [created] = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
      return Response.json(shareResponse(created));
    }

    const [updated] = await db
      .update(shareLinks)
      .set({ permission: parsed.value.permission, active: parsed.value.active, updatedAt: now })
      .where(eq(shareLinks.mapId, id))
      .returning();
    return Response.json(shareResponse(updated));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法更新分享設定" }, { status: 500 });
  }
}
