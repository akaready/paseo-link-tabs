import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { isCleared } from "../shared/groups";
import type { Link } from "../shared/links";
import { findUrls } from "./urls";

type Paseo = PluginHandlerContext["paseo"];
type Timeline = ReturnType<Paseo["agents"]["ref"]>["timeline"];
type Page = Awaited<ReturnType<Timeline["refetch"]>>;
type Entry = Page["entries"][number];

const PAGE_SIZE = 200;

/** An agent message with links in it, by its place in the timeline. */
interface Mention {
  seqStart: number;
  seqEnd: number;
  urls: string[];
}

/** What has been read of one agent's timeline: its messages with links, up to `lastSeq`. */
interface Read {
  epoch: string;
  mentions: Mention[];
  lastSeq: number;
}

const reads = new Map<string, Read>();

function mentionsOf(entries: Entry[]): Mention[] {
  return entries.flatMap(({ item, seqStart, seqEnd }) => {
    if (item.type !== "assistant_message") return [];
    const urls = findUrls(item.text);
    return urls.length ? [{ seqStart, seqEnd, urls }] : [];
  });
}

/** The whole timeline, read back page by page from the newest one. */
async function readAll(timeline: Timeline, tail: Page): Promise<Read> {
  let page = tail;
  let mentions = mentionsOf(page.entries);
  while (page.hasOlder && page.startCursor) {
    page = await timeline.refetch({
      direction: "before",
      cursor: page.startCursor,
      limit: PAGE_SIZE,
      projection: "projected",
    });
    mentions = [...mentionsOf(page.entries), ...mentions];
  }
  return { epoch: tail.epoch, mentions, lastSeq: tail.entries.at(-1)?.seqEnd ?? -1 };
}

/**
 * Reads the newest page, which replaces what it overlaps, so a message still streaming last time
 * is read again in full. A gap wider than a page, or a new epoch, reads the whole timeline.
 */
async function read(paseo: Paseo, agentId: string): Promise<Read> {
  const timeline = paseo.agents.ref(agentId).timeline;
  const tail = await timeline.refetch({
    direction: "tail",
    limit: PAGE_SIZE,
    projection: "projected",
  });
  const known = reads.get(agentId);
  const first = tail.entries[0]?.seqStart;
  if (first === undefined) return { epoch: tail.epoch, mentions: [], lastSeq: -1 };
  if (!known || known.epoch !== tail.epoch || (tail.hasOlder && first > known.lastSeq + 1)) {
    return readAll(timeline, tail);
  }
  return {
    epoch: tail.epoch,
    mentions: [
      ...known.mentions.filter((mention) => mention.seqStart < first),
      ...mentionsOf(tail.entries),
    ],
    lastSeq: tail.entries.at(-1)!.seqEnd,
  };
}

/** The agent's links, newest first, leaving out each one deleted since its newest mention. */
export async function linksOf(
  paseo: Paseo,
  agentId: string,
  cleared: Readonly<Record<string, number>>,
): Promise<Link[]> {
  const current = await read(paseo, agentId);
  reads.set(agentId, current);
  const newest = new Map<string, number>();
  for (const { seqEnd, urls } of current.mentions) {
    for (const url of urls) newest.set(url, Math.max(newest.get(url) ?? -1, seqEnd));
  }
  return [...newest]
    .map(([url, seq]) => ({ url, seq }))
    .filter((link) => !isCleared(link, cleared))
    .sort((a, b) => b.seq - a.seq);
}
