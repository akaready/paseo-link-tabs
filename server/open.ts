import { execCommand } from "@getpaseo/plugin/server";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * How each platform opens a file with the app that owns it, usually the browser. Paseo's own
 * opener takes only http(s) and a local page is not one, so the file goes to the OS instead.
 */
const OPENER: Record<string, { command: string; before: string[] }> = {
  darwin: { command: "open", before: [] },
  win32: { command: "cmd", before: ["/c", "start", ""] },
  linux: { command: "xdg-open", before: [] },
};

/**
 * Opens the local HTML file at `url` with the OS, on the host the daemon runs on. Nothing else
 * opens: a URL from another scheme, a path to something but an HTML file, or a file that is gone.
 */
export async function openLocalFile(url: string): Promise<boolean> {
  if (!/^file:\/\//i.test(url)) return false;
  let path: string;
  try {
    path = fileURLToPath(url);
  } catch {
    return false;
  }
  if (!/\.(html?|htm)$/i.test(path)) return false;
  const file = await stat(path).catch(() => null);
  if (!file?.isFile()) return false;
  const opener = OPENER[process.platform];
  if (!opener) return false;
  try {
    await execCommand(opener.command, [...opener.before, path]);
    return true;
  } catch {
    return false;
  }
}
