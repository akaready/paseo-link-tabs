import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The scheme at the front of a reference, as in `mailto:` or `https:`. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** Punctuation that ends a sentence rather than the path. */
const TRAILING = /[.,;:!?*_~]+$/;
/** A local HTML file named in text: a `file://` URL, or a path ending in `.html` or `.htm`. */
const CANDIDATE = /(?:file:\/\/[^\s<>"'`()[\]]+|[~\w@%+.\/-]*\.(?:html?|htm))(?![\w-])(?!\.\w)/gi;
/** A page on a site, which is a URL rather than a file; taken out before looking for files. */
const WEB_URL = /https?:\/\/[^\s<>"'`[\]{}|\\^]+/g;

/**
 * The local HTML file `reference` names, as an absolute path, or null when it names anything
 * else: another scheme, another kind of file, or a relative path with no working directory to
 * resolve it against.
 */
export function htmlPath(reference: string, cwd: string | null): string | null {
  const candidate = reference.trim().replace(TRAILING, "");
  if (/^file:\/\//i.test(candidate)) {
    try {
      const path = fileURLToPath(candidate);
      return /\.(html?|htm)$/i.test(path) ? path : null;
    } catch {
      return null;
    }
  }
  if (SCHEME.test(candidate) || !/\.(html?|htm)$/i.test(candidate)) return null;
  if (candidate.startsWith("~")) return join(homedir(), candidate.slice(1));
  if (isAbsolute(candidate)) return candidate;
  return cwd ? resolve(cwd, candidate) : null;
}

/** Every local HTML file `text` names, as absolute paths, repeats included. */
export function htmlPathsIn(text: string, cwd: string | null): string[] {
  const paths: string[] = [];
  for (const [candidate] of text.replace(WEB_URL, " ").matchAll(CANDIDATE)) {
    const path = htmlPath(candidate, cwd);
    if (path) paths.push(path);
  }
  return paths;
}
