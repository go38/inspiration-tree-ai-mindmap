import assert from "node:assert/strict";
import test from "node:test";
import {
  extractWebsiteText,
  isPublicHttpsUrl,
  parseKnowledgeImportRequest,
} from "../app/lib/knowledgeImport.ts";

test("knowledge website URLs must be public HTTPS addresses", () => {
  assert.equal(isPublicHttpsUrl("https://example.com/article"), true);
  for (const value of [
    "http://example.com",
    "https://localhost/page",
    "https://127.0.0.1/page",
    "https://10.0.0.4/page",
    "https://192.168.1.2/page",
    "https://172.16.0.3/page",
    "https://notes.local/page",
    "not a url",
  ]) assert.equal(isPublicHttpsUrl(value), false, value);
});

test("knowledge import requests validate each source type", () => {
  assert.deepEqual(parseKnowledgeImportRequest({
    sourceType: "website",
    url: " https://example.com/guide ",
  }), { sourceType: "website", url: "https://example.com/guide", content: "", filename: "", fileData: "" });

  const transcript = parseKnowledgeImportRequest({
    sourceType: "transcript",
    url: "https://video.example/watch/1",
    content: " 這是一段足以整理成心智圖的影音逐字稿內容。 ",
  });
  assert.equal(transcript?.sourceType, "transcript");
  assert.match(transcript?.content ?? "", /影音逐字稿/);

  const pdf = parseKnowledgeImportRequest({
    sourceType: "pdf",
    filename: "課程？.pdf",
    fileData: "data:application/pdf;base64,JVBERi0xLjQ=",
  });
  assert.equal(pdf?.filename, "課程.pdf");
  assert.equal(parseKnowledgeImportRequest({ sourceType: "transcript", content: "太短" }), null);
  assert.equal(parseKnowledgeImportRequest({ sourceType: "pdf", filename: "notes.txt", fileData: "data:text/plain;base64,QQ==" }), null);
});

test("website extraction removes executable markup and preserves readable text", () => {
  const text = extractWebsiteText(`
    <html><head><style>.hidden{display:none}</style><script>alert("no")</script></head>
    <body><h1>AI &amp; 心智圖</h1><p>第一段&nbsp;內容</p><svg><text>ignore</text></svg></body></html>
  `);
  assert.equal(text, "AI & 心智圖 第一段 內容");
});
