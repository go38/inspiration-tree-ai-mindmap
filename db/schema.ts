import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// One shared mind map. The whole node graph is stored as a JSON string in
// `data` (simplest at this scale); `version` is an optimistic lock that also
// becomes the sync baseline when realtime collaboration lands later.
export const mindMaps = sqliteTable("mind_maps", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("未命名心智圖"),
  data: text("data").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedBy: text("updated_by"),
});
