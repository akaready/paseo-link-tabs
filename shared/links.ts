import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * A link the agent shared, and the timeline position of its newest mention. A link to a local
 * file also carries its path, with the home folder as `~`, which reads better than the URL.
 */
const link = z.object({
  url: z.string(),
  seq: z.number(),
  path: z.string().optional(),
  /** When its newest mention was made, in epoch milliseconds. Absent when unknown. */
  seenAt: z.number().optional(),
  /** The page's title, once the daemon has read it. */
  title: z.string().optional(),
});

export type Link = z.output<typeof link>;

const group = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string(),
  /** Pinned to the bar as a button of its own that lists its links. */
  pinned: z.boolean(),
});

export type Group = z.output<typeof group>;

const arrangedGroup = group.extend({
  /** One of Link Tabs' own groups, rather than one the user added. */
  builtIn: z.boolean(),
  /** `pinned`: the link has a pill of its own in the bar. */
  links: z.array(
    link.extend({
      pinned: z.boolean(),
      name: z.string().optional(),
      /** Not mentioned for a week and not pinned: listed under the group's Archive row. */
      archived: z.boolean(),
    }),
  ),
});

export type ArrangedGroup = z.output<typeof arrangedGroup>;

/** Where a tap opens a link: Paseo's own browser, or whatever the OS opens it with. */
const opener = z.enum(["paseo", "system"]);

export type Opener = z.output<typeof opener>;

/**
 * The links an agent shared in its messages, without the ones the user deleted, in the user's
 * groups and order.
 */
export const listLinks = defineRpc({
  name: "links.list",
  input: z.object({ agentId: z.string() }),
  output: z.object({
    groups: z.array(arrangedGroup),
    opener,
  }),
});

/**
 * Opens the local file a link points to, with the OS on the host the daemon runs on. A local page
 * cannot go through Paseo's own opener, which takes only http(s). Answers whether it opened.
 */
export const openLink = defineRpc({
  name: "links.open",
  input: z.object({ url: z.string() }),
  output: z.object({ opened: z.boolean() }),
});

/**
 * The http URL that serves a local HTML file, for Paseo's own browser, which takes only http(s)
 * and so cannot open a file. Null for a web link, or a file that is gone.
 */
export const previewLink = defineRpc({
  name: "links.preview",
  input: z.object({ url: z.string() }),
  output: z.object({ url: z.string().nullable() }),
});

/**
 * How the user organizes links, shared by every client of the host. Everything but deletions
 * applies in every chat, matched by URL.
 */
export const linkSettings = defineSettings({
  id: "links",
  scope: "host",
  version: 1,
  schema: z.object({
    /**
     * The links deleted per agent: each URL with the position of the mention deleted. A later
     * mention brings the link back.
     */
    cleared: z.record(z.string(), z.record(z.string(), z.number())).default({}),
    /** Every group, in order. Empty means Link Tabs' own groups in their own order. */
    groups: z.array(group).default([]),
    /** The group each link was dragged into, by URL. */
    placed: z.record(z.string(), z.string()).default({}),
    /** Each group's links in the order they were dragged into, by URL. Others follow, newest first. */
    order: z.record(z.string(), z.array(z.string())).default({}),
    /** Links pinned to the bar as pills of their own, by URL. None are, until the user pins one. */
    pinnedLinks: z.array(z.string()).default([]),
    /** Names the user gave groups, by group ID. */
    titles: z.record(z.string(), z.string()).default({}),
    /** Names the user gave links, by URL. */
    names: z.record(z.string(), z.string()).default({}),
    /**
     * Where a tap opens a link: Paseo's own browser, which keeps the page in the workspace, or
     * whatever the OS opens it with. The web app and the phones have no Paseo browser, so there
     * the OS opens it either way.
     */
    // Your browser by default: Paseo's own needs a panel to open it, and that panel is a tab the
    // user did not ask for, so it stays opt-in.
    opener: opener.default("system"),
  }),
});

export type LinkValues = z.output<typeof linkSettings.schema>;
