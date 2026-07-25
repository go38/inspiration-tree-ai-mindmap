import assert from "node:assert/strict";
import test from "node:test";
import {
  parseMapViewState,
  serializeMapViewState,
} from "../app/lib/viewState.ts";

test("map view state stores sorted, unique collapsed node ids", () => {
  const serialized = serializeMapViewState([4, 2, 4, -1, 3.5, 3]);
  assert.deepEqual(JSON.parse(serialized), { version: 1, collapsedIds: [2, 3, 4] });
  assert.deepEqual(parseMapViewState(serialized), { version: 1, collapsedIds: [2, 3, 4] });
});

test("map view state ignores malformed data and ids outside the current map", () => {
  const validIds = new Set([1, 2, 3]);
  assert.deepEqual(parseMapViewState(null, validIds), { version: 1, collapsedIds: [] });
  assert.deepEqual(parseMapViewState("{broken", validIds), { version: 1, collapsedIds: [] });
  assert.deepEqual(
    parseMapViewState(JSON.stringify({ version: 1, collapsedIds: [2, 99, "3", 1] }), validIds),
    { version: 1, collapsedIds: [1, 2] },
  );
  assert.deepEqual(
    parseMapViewState(JSON.stringify({ version: 2, collapsedIds: [1] }), validIds),
    { version: 1, collapsedIds: [] },
  );
});
