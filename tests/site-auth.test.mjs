import assert from "node:assert/strict";
import test from "node:test";
import { checkSiteAccess, isPublicPath, readBasicPassword, secretsMatch } from "../app/lib/siteAuth.ts";

const PASSWORD = "let-me-in";

function requestFor(path, header) {
  return new Request(`https://mind.milifun.net${path}`, {
    headers: header ? { authorization: header } : {},
  });
}

function basic(user, password) {
  return `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
}

test("share pages and their assets stay public", () => {
  for (const path of ["/m/abc123", "/s/token-value", "/assets/index-Ctdqut2S.js", "/favicon.svg"]) {
    assert.equal(isPublicPath(path), true, path);
    assert.equal(checkSiteAccess(requestFor(path), PASSWORD), null, path);
  }
});

test("the studio and the AI routes are gated", () => {
  for (const path of ["/", "/maps", "/api/suggest", "/api/knowledge-import", "/api/generate-map"]) {
    assert.equal(isPublicPath(path), false, path);
    const response = checkSiteAccess(requestFor(path), PASSWORD);
    assert.equal(response?.status, 401, path);
    assert.match(response.headers.get("www-authenticate") ?? "", /^Basic realm=/);
  }
});

test("a path that merely starts with a public prefix is not public", () => {
  // "/maps" must not ride in on "/m/", and "/m" alone is not a share page.
  assert.equal(isPublicPath("/maps"), false);
  assert.equal(isPublicPath("/m"), false);
});

test("the right password opens every gated path, any username", () => {
  assert.equal(checkSiteAccess(requestFor("/api/suggest", basic("eric", PASSWORD)), PASSWORD), null);
  assert.equal(checkSiteAccess(requestFor("/api/suggest", basic("", PASSWORD)), PASSWORD), null);
});

test("wrong, empty and malformed credentials are refused", () => {
  for (const header of [basic("eric", "wrong"), basic("eric", ""), "Basic !!!not-base64!!!", "Bearer token", "Basic"]) {
    assert.equal(checkSiteAccess(requestFor("/", header), PASSWORD)?.status, 401, header);
  }
});

test("no configured password means no gate, so local dev is unchanged", () => {
  assert.equal(checkSiteAccess(requestFor("/api/suggest"), undefined), null);
  assert.equal(checkSiteAccess(requestFor("/api/suggest"), ""), null);
});

test("passwords survive UTF-8 and colons", () => {
  assert.equal(readBasicPassword(basic("eric", "密碼:含冒號")), "密碼:含冒號");
  assert.equal(checkSiteAccess(requestFor("/", basic("eric", "密碼:含冒號")), "密碼:含冒號"), null);
});

test("readBasicPassword rejects what is not a Basic header", () => {
  assert.equal(readBasicPassword(null), null);
  assert.equal(readBasicPassword("Basic"), null);
  assert.equal(readBasicPassword(`Basic ${Buffer.from("no-colon", "utf8").toString("base64")}`), null);
});

test("secretsMatch is exact", () => {
  assert.equal(secretsMatch("abc", "abc"), true);
  assert.equal(secretsMatch("abc", "abcd"), false);
  assert.equal(secretsMatch("abc", "abd"), false);
  assert.equal(secretsMatch("", ""), true);
});
