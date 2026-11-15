import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isFileUrl } from "../shared/groups";

const OK_TTL = 60 * 60_000;
const FAIL_TTL = 5 * 60_000;
const READ_BYTES = 64 * 1024;
const MAX_LENGTH = 120;
const CONCURRENCY = 4;

const cache = new Map<string, { title: string | null; expires: number }>();
const inflight = new Set<string>();
const queue: string[] = [];
let running = 0;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string) {
  return text.replace(/&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi, (whole, dec, hex, name) => {
    if (name) return ENTITIES[name.toLowerCase()] ?? whole;
    const code = dec ? Number(dec) : parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

/** The page's `<title>`, else its `og:title`, cleaned up; null when it has neither. */
function titleIn(html: string) {
  const raw =
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ??
    /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ??
    /<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:title["']/i.exec(html)?.[1];
  const title = decode(raw ?? "").replace(/\s+/g, " ").trim();
  return title ? title.slice(0, MAX_LENGTH) : null;
}

async function fetchHtml(url: string) {
  if (isFileUrl(url)) {
    const bytes = await readFile(fileURLToPath(url));
    return bytes.subarray(0, READ_BYTES).toString("utf8");
  }
  // No cookies or credentials: a plain GET.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 3000);
  try {
    return await readPage(url, abort.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function readPage(url: string, signal: AbortSignal) {
  const res = await fetch(url, { signal, credentials: "omit" });
  if (!res.ok || !res.body || !/text\/html/i.test(res.headers.get("content-type") ?? "")) {
    await res.body?.cancel();
    return "";
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of res.body) {
    chunks.push(chunk);
    size += chunk.length;
    if (size >= READ_BYTES) break;
  }
  await res.body.cancel().catch(() => {});
  return Buffer.concat(chunks).subarray(0, READ_BYTES).toString("utf8");
}

async function load(url: string) {
  let title: string | null = null;
  try {
    title = titleIn(await fetchHtml(url));
  } catch {
    // A failed fetch is cached as no title, for a shorter while.
  }
  cache.set(url, { title, expires: Date.now() + (title ? OK_TTL : FAIL_TTL) });
}

function pump() {
  while (running < CONCURRENCY && queue.length) {
    const url = queue.shift()!;
    running += 1;
    void load(url).finally(() => {
      running -= 1;
      inflight.delete(url);
      pump();
    });
  }
}

/**
 * The titles known so far, at once. Pages not yet known are fetched in the background, and
 * `pending` tells the caller to ask again shortly.
 */
export function titlesOf(urls: readonly string[]) {
  const titles = new Map<string, string>();
  let pending = false;
  for (const url of urls) {
    const hit = cache.get(url);
    if (hit && hit.expires > Date.now()) {
      if (hit.title) titles.set(url, hit.title);
      continue;
    }
    if (hit?.title) titles.set(url, hit.title);
    pending = true;
    if (!inflight.has(url)) {
      inflight.add(url);
      queue.push(url);
    }
  }
  pump();
  return { titles, pending };
}
