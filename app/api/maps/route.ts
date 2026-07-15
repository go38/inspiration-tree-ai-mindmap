import { getDb } from "../../../db";
import { mindMaps } from "../../../db/schema";
import { parseCreatePayload, serializeMapData } from "../../lib/sharedMap";

export const dynamic = "force-dynamic";

function toRouteErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const detail = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  if (`${message}\n${detail}`.includes("no such table")) {
    return "心智圖資料表尚未建立。請在本機執行 `npm run db:generate` 產生 migration，再部署讓平台套用到真正的 D1。";
  }
  return message;
}

/** ~96 bits of entropy, URL-safe — unguessable so map ids can't be enumerated. */
function generateMapId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// POST /api/maps — create a shared map, returns its id.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = parseCreatePayload(body);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

    const db = getDb();
    const id = generateMapId();
    const now = new Date().toISOString();
    const updatedBy = request.headers.get("oai-authenticated-user-email");

    await db.insert(mindMaps).values({
      id,
      title: parsed.value.title,
      data: serializeMapData(parsed.value.nodes),
      version: 1,
      updatedAt: now,
      updatedBy,
    });

    return Response.json({ id, version: 1, updatedAt: now }, { status: 201 });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
