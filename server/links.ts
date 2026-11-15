import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { isCleared } from "../shared/groups";
import type { Link } from "../shared/links";
import { htmlPath, htmlPathsIn } from "./files";
import { findUrls } from "./urls";

type Paseo = PluginHandlerContext["paseo"];
type Timeline = ReturnType<Paseo["agents"]["ref"]>["timeline"];
type Page = Awaited<ReturnType<Timeline["refetch"]>>;
type Entry = Page["entries"][number];

const PAGE_SIZE = 200;
const HOME = `${homedir()}/`;

/** An agent message with links in it, by its place in the timeline. */
interface Mention {
  seqStart: number;
  seqEnd: number;
  /** When the message was written, in epoch milliseconds. */
  at: number | undefined;
  urls: string[];
  /** Local HTML files it names, as absolute paths. */
  files: string[];
}

/**
 * What has been read of one agent's timeline: its messages with links, up to `lastSeq`, read
 * against `cwd`, which relative paths in them are resolved from.
 */
interface Read {
  epoch: string;
  cwd: string | null;
  mentions: Mention[];
  lastSeq: number;
}

const reads = new Map<string, Read>();

/**
 * The links in one timeline entry: URLs and local HTML files in what the agent said, and the HTML
 * file it wrote or edited, since a page being built is a link to open even when it goes unnamed.
 */
function mentionsOf(entries: Entry[], cwd: string | null): Mention[] {
  return entries.flatMap(({ item, seqStart, seqEnd, timestamp }) => {
    const urls: string[] = [];
    const files: string[] = [];
    if (item.type === "assistant_message") {
      urls.push(...findUrls(item.text));
      files.push(...htmlPathsIn(item.text, cwd));
    } else if (item.type === "tool_call") {
      const { detail } = item;
      if (detail.type === "write" || detail.type === "edit") {
        const path = htmlPath(detail.filePath, cwd);
        if (path) files.push(path);
      }
    }
    return urls.length || files.length ? [{ seqStart, seqEnd, at: Date.parse(timestamp) || undefined, urls, files }] : [];
  });
}

/** The whole timeline, read back page by page from the newest one. */
async function readAll(timeline: Timeline, tail: Page, cwd: string | null): Promise<Read> {
  let page = tail;
  let mentions = mentionsOf(page.entries, cwd);
  while (page.hasOlder && page.startCursor) {
    page = await timeline.refetch({
      direction: "before",
      cursor: page.startCursor,
      limit: PAGE_SIZE,
      projection: "projected",
    });
    mentions = [...mentionsOf(page.entries, cwd), ...mentions];
  }
  return { epoch: tail.epoch, cwd, mentions, lastSeq: tail.entries.at(-1)?.seqEnd ?? -1 };
}

/**
 * Reads the newest page, which replaces what it overlaps, so a message still streaming last time
 * is read again in full. A gap wider than a page, a new epoch, or a working directory learned or
 * changed reads the whole timeline, since relative paths were resolved without it or from another.
 */
async function read(paseo: Paseo, agentId: string): Promise<Read> {
  const agent = paseo.agents.ref(agentId);
  const tail = await agent.timeline.refetch({
    direction: "tail",
    limit: PAGE_SIZE,
    projection: "projected",
  });
  // The refetch carries the agent's snapshot, which is where its working directory comes from.
  const cwd = agent.cwd;
  const known = reads.get(agentId);
  const first = tail.entries[0]?.seqStart;
  if (first === undefined) return { epoch: tail.epoch, cwd, mentions: [], lastSeq: -1 };
  if (
    !known ||
    known.epoch !== tail.epoch ||
    known.cwd !== cwd ||
    (tail.hasOlder && first > known.lastSeq + 1)
  ) {
    return readAll(agent.timeline, tail, cwd);
  }
  return {
    epoch: tail.epoch,
    cwd,
    mentions: [
      ...known.mentions.filter((mention) => mention.seqStart < first),
      ...mentionsOf(tail.entries, cwd),
    ],
    lastSeq: tail.entries.at(-1)!.seqEnd,
  };
}

const isFile = async (path: string) => (await stat(path).catch(() => null))?.isFile() ?? false;

/** A local file's path as the list shows it: the home folder as `~`. */
const tilde = (path: string) => (path.startsWith(HOME) ? `~/${path.slice(HOME.length)}` : path);

/**
 * The agent's links, newest first, leaving out each one deleted since its newest mention. A local
 * file counts only while it is there, so a page that was removed, or a path only talked about,
 * stays out of the list.
 */
export async function linksOf(
  paseo: Paseo,
  agentId: string,
  cleared: Readonly<Record<string, number>>,
): Promise<Link[]> {
  const current = await read(paseo, agentId);
  reads.set(agentId, current);
  const newest = new Map<string, number>();
  const seen = new Map<string, number>();
  /** The path behind each link to a local file, by its URL. */
  const paths = new Map<string, string>();
  for (const { seqEnd, at, urls, files } of current.mentions) {
    const note = (url: string) => {
      newest.set(url, Math.max(newest.get(url) ?? -1, seqEnd));
      if (at !== undefined) seen.set(url, Math.max(seen.get(url) ?? 0, at));
    };
    for (const url of urls) note(url);
    for (const path of files) {
      const url = pathToFileURL(path).href;
      note(url);
      paths.set(url, path);
    }
  }
  const present = new Set(
    (
      await Promise.all(
        [...paths].map(async ([url, path]) => ((await isFile(path)) ? url : null)),
      )
    ).filter((url) => url !== null),
  );
  return [...newest]
    .filter(([url]) => !paths.has(url) || present.has(url))
    .map(([url, seq]) => {
      const path = paths.get(url);
      return { url, seq, seenAt: seen.get(url), ...(path ? { path: tilde(path) } : null) };
    })
    .filter((link) => !isCleared(link, cleared))
    .sort((a, b) => b.seq - a.seq);
}
