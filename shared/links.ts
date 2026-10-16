import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** A link the agent shared, and the timeline position of its newest mention. */
const link = z.object({ url: z.string(), seq: z.number() });

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
  links: z.array(link.extend({ pinned: z.boolean(), name: z.string().optional() })),
});

export type ArrangedGroup = z.output<typeof arrangedGroup>;

/**
 * The links an agent shared in its messages, without the ones the user deleted, in the user's
 * groups and order.
 */
export const listLinks = defineRpc({
  name: "links.list",
  input: z.object({ agentId: z.string() }),
  output: z.object({ groups: z.array(arrangedGroup) }),
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
  }),
});

export type LinkValues = z.output<typeof linkSettings.schema>;
