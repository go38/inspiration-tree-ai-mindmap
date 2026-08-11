import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { mindMaps, shareLinks } from "../../../../../db/schema";
import { parseShareLinkUpdate, shareLinkState } from "../../../../lib/shareAccess";
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

function shareResponse(link: typeof shareLinks.$inferSelect | undefined, nowMs = Date.now()) {
  if (!link) return { share: null };
  return {
    share: {
      token: link.token,
      permission: link.permission,
      active: link.active,
      expiresAt: link.expiresAt,
      revokedAt: link.revokedAt,
      state: shareLinkState(link, nowMs),
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

// PUT /api/maps/:id/share — owner-only enable, disable, change role, set an
// expiry, or rotate the token.
export async function PUT(request: Request, context: RouteContext) {
  const ownerEmail = ownerFromRequest(request);
  if (!ownerEmail) return Response.json({ error: "請先登入 ChatGPT" }, { status: 401 });
  const now = new Date();
  const parsed = parseShareLinkUpdate(await request.json().catch(() => null), now.getTime());
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const { id } = await context.params;

  try {
    if (!await ownedMap(id, ownerEmail)) return Response.json({ error: "找不到這張個人地圖" }, { status: 404 });
    const db = getDb();
    const [existing] = await db.select().from(shareLinks).where(eq(shareLinks.mapId, id)).limit(1);
    // Revocation is permanent for that token: the only way forward is a new one.
    if (existing?.revokedAt && !parsed.value.regenerate) {
      return Response.json({ error: "這個連結已撤銷，請重新產生新的分享連結。", code: "SHARE_REVOKED" }, { status: 409 });
    }
    const timestamp = now.toISOString();
    if (!existing || parsed.value.regenerate) {
      if (existing) await db.delete(shareLinks).where(eq(shareLinks.mapId, id));
      const token = generateShareToken();
      await db.insert(shareLinks).values({
        token,
        mapId: id,
        permission: parsed.value.permission,
        active: parsed.value.active,
        expiresAt: parsed.value.expiresAt,
        createdBy: ownerEmail,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      const [created] = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
      return Response.json(shareResponse(created, now.getTime()));
    }

    const [updated] = await db
      .update(shareLinks)
      .set({
        permission: parsed.value.permission,
        active: parsed.value.active,
        expiresAt: parsed.value.expiresAt,
        updatedAt: timestamp,
      })
      .where(eq(shareLinks.mapId, id))
      .returning();
    return Response.json(shareResponse(updated, now.getTime()));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法更新分享設定" }, { status: 500 });
  }
}

// DELETE /api/maps/:id/share — owner-only revoke. The row is kept as a
// tombstone so the token can never come back to life and so anyone holding it
// sees "已撤銷" rather than a generic invalid-link page.
export async function DELETE(request: Request, context: RouteContext) {
  const ownerEmail = ownerFromRequest(request);
  if (!ownerEmail) return Response.json({ error: "請先登入 ChatGPT" }, { status: 401 });
  const { id } = await context.params;

  try {
    if (!await ownedMap(id, ownerEmail)) return Response.json({ error: "找不到這張個人地圖" }, { status: 404 });
    const db = getDb();
    const now = new Date();
    const timestamp = now.toISOString();
    const [revoked] = await db
      .update(shareLinks)
      .set({ active: false, revokedAt: timestamp, updatedAt: timestamp })
      .where(eq(shareLinks.mapId, id))
      .returning();
    if (!revoked) return Response.json({ error: "這張地圖沒有分享連結" }, { status: 404 });
    return Response.json(shareResponse(revoked, now.getTime()));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法撤銷分享連結" }, { status: 500 });
  }
}
