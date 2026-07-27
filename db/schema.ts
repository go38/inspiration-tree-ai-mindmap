import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// One shared mind map. The whole node graph is stored as a JSON string in
// `data` (simplest at this scale); `version` is an optimistic lock that also
// becomes the sync baseline when realtime collaboration lands later.
export const mindMaps = sqliteTable(
  "mind_maps",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull().default("未命名心智圖"),
    data: text("data").notNull(),
    version: integer("version").notNull().default(1),
    ownerEmail: text("owner_email"),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedBy: text("updated_by"),
  },
  (table) => [
    index("mind_maps_owner_updated_idx").on(table.ownerEmail, table.archivedAt, table.updatedAt),
  ],
);

// One active share link per map. The opaque token is the public capability;
// authorization is still enforced server-side for every read and write.
export const shareLinks = sqliteTable(
  "share_links",
  {
    token: text("token").primaryKey(),
    mapId: text("map_id").notNull().references(() => mindMaps.id, { onDelete: "cascade" }),
    permission: text("permission", { enum: ["view", "comment", "edit"] }).notNull().default("view"),
    active: integer("active", { mode: "boolean" }).notNull().default(false),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("share_links_map_idx").on(table.mapId),
    index("share_links_active_idx").on(table.active, table.token),
  ],
);
