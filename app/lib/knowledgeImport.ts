export type KnowledgeSourceType = "pdf" | "website" | "transcript";
export type KnowledgeImportRequest = {
  sourceType: KnowledgeSourceType;
  url: string;
  content: string;
  filename: string;
  fileData: string;
};

const PRIVATE_IPV4 = /^(?:127\.|10\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

export function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" &&
      hostname !== "localhost" &&
      hostname !== "::1" &&
      !hostname.endsWith(".local") &&
      !PRIVATE_IPV4.test(hostname);
  } catch {
    return false;
  }
}

export function parseKnowledgeImportRequest(value: unknown): KnowledgeImportRequest | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (source.sourceType !== "pdf" && source.sourceType !== "website" && source.sourceType !== "transcript") return null;
  const sourceType = source.sourceType;
  const url = typeof source.url === "string" ? source.url.trim().slice(0, 2048) : "";
  const content = typeof source.content === "string" ? source.content.trim().slice(0, 80_000) : "";
  const filename = typeof source.filename === "string" ? source.filename.trim().replace(/[^\p{L}\p{N}._ -]/gu, "").slice(0, 120) : "";
  const fileData = typeof source.fileData === "string" ? source.fileData : "";
  if (sourceType === "website" && !isPublicHttpsUrl(url)) return null;
  if (sourceType === "transcript" && content.length < 20) return null;
  if (sourceType === "pdf" && (!filename.toLowerCase().endsWith(".pdf") || !fileData.startsWith("data:application/pdf;base64,") || fileData.length > 11_000_000)) return null;
  return { sourceType, url, content, filename, fileData };
}

export function extractWebsiteText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, "\"")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80_000);
}
