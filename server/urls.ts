// A URL runs up to whitespace or a character that quotes or brackets it in Markdown or prose. The
// character after it is captured so a template such as `http://localhost:<port>` can be skipped.
const CANDIDATE = /(https?:\/\/[^\s<>"'`[\]{}|\\^]+)([<{]?)/g;
const TRAILING = /[.,;:!?*_~]+$/;
const HOST = /^https?:\/\/[^/?#:]+/;
// `http://localhost:3000/` and `http://localhost:3000` are one link.
const BARE_SLASH = /^(https?:\/\/[^/?#]+)\/$/;

const count = (text: string, char: string) => text.split(char).length - 1;

/** Drops the punctuation that ends a sentence or a Markdown span, and a `)` the URL never opened. */
function trim(candidate: string) {
  let url = candidate;
  for (;;) {
    const before = url;
    url = url.replace(TRAILING, "");
    if (url.endsWith(")") && count(url, "(") < count(url, ")")) url = url.slice(0, -1);
    if (url === before) return url;
  }
}

/** Every http(s) URL in `text`, in order, repeats included. */
export function findUrls(text: string): string[] {
  const urls: string[] = [];
  for (const [, candidate, template] of text.matchAll(CANDIDATE)) {
    if (template) continue;
    const url = trim(candidate!).replace(BARE_SLASH, "$1");
    if (HOST.test(url)) urls.push(url);
  }
  return urls;
}
