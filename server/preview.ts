import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { dirname, extname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * How long the preview server stays up after the last page it served. Paseo's browser takes only
 * http(s), and a local file is not one, so a page being previewed in it is served from here.
 */
const IDLE_MS = 30 * 60 * 1000;

/** What a browser asks for when a page is served, by the file's extension. */
const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

/** The one preview server, up while a page is being looked at. */
interface Preview {
  server: Server;
  port: number;
  /** The folder each token serves, so a page's own CSS, scripts, and images load with it. */
  roots: Map<string, string>;
  /** The token that serves each folder, so the same page keeps one URL. */
  tokens: Map<string, string>;
  idle: NodeJS.Timeout;
}

let preview: Preview | null = null;
/** Starting the server, while it is still binding its port. */
let starting: Promise<Preview | null> | null = null;

const isFile = async (path: string) => (await stat(path).catch(() => null))?.isFile() ?? false;

/** A path split into segments, each encoded the way a URL wants it. */
const encodePath = (path: string) =>
  path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

function stop() {
  const current = preview;
  preview = null;
  if (!current) return;
  clearTimeout(current.idle);
  current.server.close();
  current.server.closeAllConnections();
}

function start(): Promise<Preview | null> {
  if (preview) return Promise.resolve(preview);
  if (starting) return starting;
  const pending = new Promise<Preview | null>((resolve) => {
    const server = createServer(async (request, response) => {
      const deny = (status: number) => {
        response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
        response.end(status === 404 ? "Not found" : "Not allowed");
      };
      if (request.method !== "GET" && request.method !== "HEAD") return deny(405);
      const current = preview;
      if (!current) return deny(503);
      current.idle.refresh();
      const { pathname } = new URL(request.url ?? "/", "http://127.0.0.1");
      const [, token = "", ...rest] = pathname.split("/");
      const root = current.roots.get(token);
      if (!root) return deny(404);
      let path: string;
      try {
        path = join(root, decodeURIComponent(rest.join("/")));
      } catch {
        return deny(404);
      }
      // Only what sits under the page's own folder: `..` in a URL never reaches further out.
      const inside = relative(root, path);
      if (!inside || inside.startsWith("..") || isAbsolute(inside)) return deny(404);
      const file = await stat(path).catch(() => null);
      if (!file?.isFile()) return deny(404);
      response.writeHead(200, {
        "content-type": TYPES[extname(path).toLowerCase()] ?? "application/octet-stream",
        "content-length": String(file.size),
        "cache-control": "no-store",
      });
      if (request.method === "HEAD") return response.end();
      createReadStream(path)
        .on("error", () => response.destroy())
        .pipe(response);
    });
    server.on("error", () => {
      preview = null;
      resolve(null);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        return resolve(null);
      }
      const idle = setTimeout(stop, IDLE_MS);
      idle.unref();
      preview = { server, port: address.port, roots: new Map(), tokens: new Map(), idle };
      resolve(preview);
    });
  });
  starting = pending;
  return pending.finally(() => {
    starting = null;
  });
}

/**
 * The http URL a local HTML file is previewed at, serving the file's folder so the page's own
 * assets load, or null when the link is not a local HTML file that is still there.
 */
export async function previewUrlOf(url: string): Promise<string | null> {
  if (!/^file:\/\//i.test(url)) return null;
  let path: string;
  try {
    path = fileURLToPath(url);
  } catch {
    return null;
  }
  if (!/\.(html?|htm)$/i.test(path) || !(await isFile(path))) return null;
  const server = await start();
  if (!server) return null;
  const root = dirname(path);
  let token = server.tokens.get(root);
  if (!token) {
    token = randomBytes(12).toString("hex");
    server.tokens.set(root, token);
    server.roots.set(token, root);
  }
  const name = path.slice(root.length + 1);
  return `http://127.0.0.1:${server.port}/${token}/${encodePath(name)}`;
}

/** Stops the preview server: nothing is left listening once its plugin is gone. */
export const stopPreviews = stop;
