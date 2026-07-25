import assert from "node:assert/strict";
import test from "node:test";
import {
  createSeedsFromLines,
  createSeedsFromSuggestions,
  parseInboxSeeds,
  serializeInboxSeeds,
} from "../app/lib/inbox.ts";

function idFactory() {
  let id = 0;
  return () => `seed-${++id}`;
}

test("multiline notes become clean, unique inspiration seeds", () => {
  const longNote = `一段超過八十字的長筆記，用來確認完整原文會被保留在說明中，而標題仍維持適合顯示於收件匣與心智圖節點的合理長度，避免畫面被單一想法撐開。${"持續補充更多觀察與下一步行動。".repeat(4)}`;
  const seeds = createSeedsFromLines(
    `- 設計訪談題目\n2. 找三位受訪者｜先從既有客戶開始\n設計訪談題目\n${longNote}`,
    [],
    { now: "2026-07-25T00:00:00.000Z", idFactory: idFactory() },
  );

  assert.equal(seeds.length, 3);
  assert.equal(seeds[0].title, "設計訪談題目");
  assert.equal(seeds[1].title, "找三位受訪者");
  assert.equal(seeds[1].note, "先從既有客戶開始");
  assert.ok(seeds[2].title.length <= 80);
  assert.match(seeds[2].note, /完整原文/);
  assert.ok(seeds.every((seed) => seed.source === "user"));
});

test("AI suggestions join the inbox without duplicating existing seeds", () => {
  const existing = createSeedsFromLines("建立原型", [], {
    now: "2026-07-25T00:00:00.000Z",
    idFactory: idFactory(),
  });
  const created = createSeedsFromSuggestions([
    { title: "建立原型", note: "重複項目" },
    { title: "安排概念測試", note: "邀請五位使用者" },
  ], existing, {
    now: "2026-07-25T00:00:00.000Z",
    idFactory: idFactory(),
  });

  assert.equal(created.length, 1);
  assert.equal(created[0].title, "安排概念測試");
  assert.equal(created[0].source, "ai");
});

test("stored inbox data is versioned and malformed entries are ignored", () => {
  const seeds = createSeedsFromLines("第一個想法\n第二個想法", [], {
    now: "2026-07-25T00:00:00.000Z",
    idFactory: idFactory(),
  });
  assert.deepEqual(parseInboxSeeds(serializeInboxSeeds(seeds)), seeds);
  assert.deepEqual(parseInboxSeeds(JSON.stringify({ version: 2, seeds })), []);
  assert.deepEqual(parseInboxSeeds(JSON.stringify({
    version: 1,
    seeds: [...seeds, { id: "bad", title: "", note: "", source: "user", createdAt: "never" }],
  })), seeds);
});
