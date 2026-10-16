import type { ArrangedGroup, Group, Link, LinkValues } from "./links";

/** Link Tabs' own groups, by where a link points, in their default order. */
const BUILT_IN: readonly Group[] = [
  { id: "dev", title: "Local dev", icon: "Laptop", pinned: false },
  { id: "tailnet", title: "Tailscale dev", icon: "Network", pinned: false },
  { id: "preview", title: "Previews", icon: "Rocket", pinned: false },
  { id: "github", title: "GitHub", icon: "GitBranch", pinned: false },
  { id: "dashboard", title: "Dashboards", icon: "LayoutDashboard", pinned: false },
  { id: "docs", title: "Docs", icon: "BookOpen", pinned: false },
  { id: "other", title: "Other", icon: "Link", pinned: false },
];

const BUILT_IN_IDS = new Set(BUILT_IN.map((group) => group.id));

/** Icons for the groups people add. */
// Each is a Lucide icon in Paseo's set: an unknown name throws when a pill uses it.
export const GROUP_ICONS = [
  "Folder Star Bookmark Tag Flag Heart Sparkles Zap Box",
  "Briefcase Building2 Users House Mail MessageSquare Calendar Clock MapPin Megaphone",
  "Code Terminal Bot Brain Cpu Database Cloud Globe Smartphone Monitor Package Rocket",
  "Bug FlaskConical Wrench Settings Shield Lock Key",
  "ShoppingCart CreditCard Camera Image Film Music FileText Palette PenTool",
  "Coffee Gamepad2 Lightbulb Target Trophy Crown Gift Flame",
]
  .join(" ")
  .split(" ");

// Tailscale: MagicDNS names, and the addresses Tailscale hands out (100.64.0.0/10, fd7a:115c:a1e0::/48).
const TAILNET_HOST =
  /\.ts\.net$|^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$|^\[fd7a:115c:a1e0:/;
// This machine, private networks, and tunnels to a local server.
const DEV_HOST =
  /^(localhost|0\.0\.0\.0|\[::1\]|127\.[\d.]+|10\.[\d.]+|192\.168\.[\d.]+|172\.(1[6-9]|2\d|3[01])\.[\d.]+)$|\.(localhost|local|internal|ngrok\.io|ngrok\.app|ngrok-free\.app|trycloudflare\.com|loca\.lt)$/;
// Deploys and previews on hosting platforms.
const PREVIEW_HOST =
  /\.(vercel\.app|netlify\.app|pages\.dev|workers\.dev|fly\.dev|onrender\.com|railway\.app|herokuapp\.com|github\.io|web\.app|firebaseapp\.com|deno\.dev|surge\.sh)$/;
const GITHUB_HOST = /(^|\.)(github\.com|githubusercontent\.com)$/;
// Consoles of the services a project runs on.
const DASHBOARD_HOST =
  /^(vercel\.com|supabase\.com|app\.netlify\.com|railway\.app|fly\.io|linear\.app|sentry\.io|(us|eu|app)\.posthog\.com|console\.cloud\.google\.com|console\.aws\.amazon\.com|admin\.shopify\.com|partners\.shopify\.com)$|^(dashboard|console|dash|admin)\./;
const DOCS_HOST =
  /^(docs|developer|developers|devdocs|api-docs)\.|^(developer\.mozilla\.org|npmjs\.com|pypi\.org|docs\.rs|pkg\.go\.dev|stackoverflow\.com|paseo\.sh)$/;

const PARTS = /^https?:\/\/(?:[^@/?#]*@)?(\[[^\]]+\]|[^:/?#]+)(:\d+)?([^?#]*)(.*)$/;

/** A URL's host (lowercase, without `www.`), port (with its colon), path, and query and hash. */
function partsOf(url: string) {
  const [, host = "", port = "", path = "", rest = ""] = PARTS.exec(url) ?? [];
  return { host: host.toLowerCase().replace(/^www\./, ""), port, path, rest };
}

/** The built-in group a link falls in by where it points. */
export function kindOf(url: string) {
  const { host, path } = partsOf(url);
  if (TAILNET_HOST.test(host)) return "tailnet";
  if (DEV_HOST.test(host)) return "dev";
  if (PREVIEW_HOST.test(host)) return "preview";
  if (GITHUB_HOST.test(host)) return "github";
  if (DASHBOARD_HOST.test(host)) return "dashboard";
  if (DOCS_HOST.test(host) || /^\/docs(\/|$)/.test(path)) return "docs";
  return "other";
}

/** A link without its scheme or a trailing slash: the whole link, as menus show it. */
export const bareOf = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

// Character widths in a pill label's font (12px system), to the half pixel. Others count as 7.5.
const CHAR_WIDTHS: [number, string][] = [
  [3, "ijlI"],
  [3.5, ".:/!',;"],
  [4.5, "frt[]()"],
  [5.5, "1-*"],
  [6, "?"],
  [6.5, "acksvxyzJ"],
  [7, "ehnouEFL27_"],
  [7.5, "bdgpqPST0345689~#$+="],
  [8, "ABKRVXYZ"],
  [8.5, "CD&"],
  [9, "GHNU"],
  [9.5, "wOQ…"],
  [10.5, "mM"],
  [11, "@%"],
  [11.5, "W"],
];
const WIDTHS = new Map(
  CHAR_WIDTHS.flatMap(([width, chars]) => [...chars].map((ch) => [ch, width])),
);
const widthOf = (text: string) => [...text].reduce((sum, ch) => sum + (WIDTHS.get(ch) ?? 7.5), 0);

/** What a pill's label may take: Paseo's 160 less border, padding, icon, and gap, less a margin. */
const PILL_WIDTH = 108;

/**
 * A label too wide for a pill keeps the longest ending that fits, from a port, path, or query
 * boundary when it has one: `…:5173/admin`. Paseo would otherwise cut the ending off.
 */
function fit(label: string) {
  if (widthOf(label) <= PILL_WIDTH) return label;
  let start = label.length;
  while (start > 0 && widthOf(`…${label.slice(start - 1)}`) <= PILL_WIDTH) start -= 1;
  const ending = label.slice(start);
  const boundary = ending.search(/[/:?#&]/);
  return `…${boundary > 0 ? ending.slice(boundary) : ending}`;
}

/**
 * A link as its pill shows it: `repo#12` for a GitHub pull request or issue, `owner/repo` for a
 * repository, the machine name for a tailnet host, else the host, port, path, and query. The
 * pill's icon says what kind of link it is, so one too wide shows its ending; a bare host keeps
 * its front, which tells hosts apart. The pill's tooltip and the list show the whole link.
 */
export function labelOf(url: string) {
  const { host, port, path, rest } = partsOf(url);
  const trimmed = rest ? path : path.replace(/\/$/, "");
  if (host === "github.com") {
    const [, owner, repo, section, id] = trimmed.split("/");
    if (repo && (section === "pull" || section === "issues") && id) return fit(`${repo}#${id}`);
    if (repo && section === "commit" && id) return fit(`${repo}@${id.slice(0, 7)}`);
    if (owner && repo && !section) return fit(`${owner}/${repo}`);
  }
  const shown = host.endsWith(".ts.net") ? host.split(".")[0]! : host;
  const label = `${shown}${port}${trimmed}${rest}`;
  return port || trimmed || rest ? fit(label) : label;
}

/**
 * Every group in the user's order, under the name the user gave it. Built-in groups take their
 * own title and icon from here, and one the user hasn't seen yet goes in after the built-in group
 * before it.
 */
export function groupsOf(values: LinkValues): Group[] {
  const groups = values.groups.map((group) => {
    const builtIn = BUILT_IN.find((candidate) => candidate.id === group.id);
    return builtIn ? { ...group, title: builtIn.title, icon: builtIn.icon } : group;
  });
  BUILT_IN.forEach((group, index) => {
    if (groups.some((other) => other.id === group.id)) return;
    const earlier = BUILT_IN.slice(0, index).map((other) => other.id);
    groups.splice(groups.findLastIndex((other) => earlier.includes(other.id)) + 1, 0, group);
  });
  return groups.map((group) => ({ ...group, title: values.titles[group.id] ?? group.title }));
}

export const isBuiltIn = (id: string) => BUILT_IN_IDS.has(id);

/** Whether a link was deleted from the list since its newest mention. */
export function isCleared(link: Link, cleared: Readonly<Record<string, number>>) {
  return link.seq <= (cleared[link.url] ?? -1);
}

/** The group a link is in: the one it was dragged into, else the built-in one for where it points. */
export function groupOf(url: string, values: LinkValues, ids: ReadonlySet<string>) {
  const placed = values.placed[url];
  return placed && ids.has(placed) ? placed : kindOf(url);
}

/**
 * Links in their groups, groups in the user's order, and links in the order they were dragged
 * into, then newest first. Built-in groups without links are left out; the user's are kept so
 * links can be dragged into them.
 */
export function arrange(links: readonly Link[], values: LinkValues): ArrangedGroup[] {
  const groups = groupsOf(values);
  const ids = new Set(groups.map((group) => group.id));
  const members = new Map(groups.map((group) => [group.id, [] as Link[]]));
  for (const link of links) members.get(groupOf(link.url, values, ids))!.push(link);
  const pinned = new Set(values.pinnedLinks);
  return groups
    .map((group) => {
      const order = values.order[group.id] ?? [];
      const rank = (url: string) => {
        const index = order.indexOf(url);
        return index < 0 ? Infinity : index;
      };
      const sorted = [...members.get(group.id)!].sort(
        (a, b) => rank(a.url) - rank(b.url) || b.seq - a.seq,
      );
      return {
        ...group,
        builtIn: isBuiltIn(group.id),
        links: sorted.map((link) => ({
          ...link,
          pinned: pinned.has(link.url),
          name: values.names[link.url],
        })),
      };
    })
    .filter((group) => group.links.length > 0 || !group.builtIn);
}
