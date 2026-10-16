import {
  openExternalUrl,
  useAgent,
  type PluginButton,
  type PluginButtonContentProps,
  type PluginButtonIconProps,
  type PluginButtonRegistration,
  type PluginClientContext,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useEffect } from "react";
import { bareOf, labelOf } from "../shared/groups";
import { listLinks, type ArrangedGroup } from "../shared/links";
import { LinkList } from "./list";

/** A pill after the Links pill: its ID, its button, and what it shows. */
type Extra = [id: string, button: PluginButton, key: string];

/**
 * One agent's bar: the Links pill first, then only what the user pinned, a button per pinned
 * group and a pill per pinned link.
 */
interface Bar {
  workspaceId: string;
  list: PluginButtonRegistration;
  extras: PluginButtonRegistration[];
  /** What `extras` shows, to skip a read that changes nothing. */
  drawn: string;
  /** On a phone the composer track is too narrow for more, so everything stays in the Links pill. */
  linksOnly: boolean;
}

/**
 * Keeps a bar of link pills in every agent's composer, following the agent directory.
 *
 * Reading an agent's timeline makes Paseo load the agent, resuming a stored one, so links are read
 * only for a chat whose composer is on screen: when its Links pill mounts, when its agent's status
 * changes, when its list opens, and after the user changes how links are organized.
 */
export function followAgents(client: PluginClientContext) {
  const bars = new Map<string, Bar>();
  /** Agents whose Links pill is on screen, with how many times. */
  const mounted = new Map<string, number>();
  const lifetime = new AbortController();

  function show(agentId: string, groups: readonly ArrangedGroup[]) {
    const bar = bars.get(agentId);
    if (!bar) return;
    const total = groups.reduce((sum, group) => sum + group.links.length, 0);
    bar.list.update({ label: total ? `Links · ${total}` : "Links" });

    const buttons = groups
      .filter((group) => group.pinned && group.links.length > 0)
      .map((group): Extra => [
        `group-${group.id}`,
        {
          title: `${group.title} links`,
          icon: group.icon,
          label: group.title,
          behavior: {
            kind: "menu",
            items: group.links.map((link, index) => ({
              kind: "item" as const,
              id: `link-${index}`,
              title: link.name ?? bareOf(link.url),
              icon: group.icon,
              behavior: { kind: "action" as const, onPress: () => openExternalUrl(link.url) },
            })),
          },
        },
        JSON.stringify([group.icon, group.title, group.links.map((link) => [link.url, link.name])]),
      ]);
    const pills = groups
      .flatMap((group) =>
        group.links.filter((link) => link.pinned).map((link) => ({ group, link })),
      )
      .map(({ group, link }, index): Extra => [
        `link-${index}`,
        {
          title: link.url,
          icon: group.icon,
          label: link.name ?? labelOf(link.url),
          behavior: { kind: "action", onPress: () => openExternalUrl(link.url) },
        },
        JSON.stringify([group.icon, link.url, link.name]),
      ]);

    const wanted = bar.linksOnly ? [] : [...buttons, ...pills];
    const drawn = JSON.stringify(wanted.map(([id, , key]) => [id, key]));
    if (drawn === bar.drawn) return;
    // Registration order is the order on screen, so the extras are added again in full.
    for (const extra of bar.extras) extra.remove();
    bar.extras = wanted.map(([id, button]) =>
      client.addComposerPill({ id, workspaceId: bar.workspaceId, agentId, button }),
    );
    bar.drawn = drawn;
  }

  function refresh(agentId: string) {
    client.rpc(listLinks, { agentId }).then(
      ({ groups }) => show(agentId, groups),
      (error) => {
        if (!lifetime.signal.aborted) console.error("[link-tabs] Reading links failed", error);
      },
    );
  }

  /** After the user reorganizes links, every chat on screen reads them again. */
  function refreshMounted() {
    for (const agentId of mounted.keys()) refresh(agentId);
  }

  function List(props: PluginButtonContentProps) {
    return <LinkList {...props} onLinks={show} onChange={refreshMounted} />;
  }

  /** The Links pill's icon, mounted only while its chat's composer is on screen. */
  function LinksIcon({ size, theme, layout, ...props }: PluginButtonIconProps) {
    const agentId = props.context === "agent" ? props.agentId : "";
    const linksOnly = layout.compact && layout.platform !== "web";
    // A turn starting or ending is when new links turn up.
    const status = useAgent(agentId, (agent) => agent.status);
    useEffect(() => {
      if (!agentId) return;
      mounted.set(agentId, (mounted.get(agentId) ?? 0) + 1);
      return () => {
        const count = (mounted.get(agentId) ?? 1) - 1;
        if (count) mounted.set(agentId, count);
        else mounted.delete(agentId);
      };
    }, [agentId]);
    useEffect(() => {
      const bar = bars.get(agentId);
      if (bar) bar.linksOnly = linksOnly;
      if (agentId) refresh(agentId);
    }, [agentId, status, linksOnly]);
    // The hero of the bar: everything else there is something the user pinned.
    return <Icon name="List" size={size} color={theme.colors.accent} />;
  }

  function remove(agentId: string) {
    const bar = bars.get(agentId);
    if (!bar) return;
    for (const pill of [bar.list, ...bar.extras]) pill.remove();
    bars.delete(agentId);
  }

  function add(agentId: string, workspaceId: string) {
    const list = client.addComposerPill({
      id: "links",
      workspaceId,
      agentId,
      button: {
        title: "Links the agent shared",
        icon: LinksIcon,
        label: "Links",
        behavior: { kind: "popover", Content: List },
      },
    });
    bars.set(agentId, { workspaceId, list, extras: [], drawn: "[]", linksOnly: false });
  }

  function observe(agent: { id: string; workspaceId?: string | null }) {
    if (lifetime.signal.aborted) return;
    const bar = bars.get(agent.id);
    if (bar?.workspaceId === agent.workspaceId) return;
    remove(agent.id);
    if (agent.workspaceId) add(agent.id, agent.workspaceId);
  }

  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      subscription.subscribe({
        snapshot: ({ entries }) => {
          const present = new Set(entries.map(({ agent }) => agent.id));
          for (const agentId of [...bars.keys()]) if (!present.has(agentId)) remove(agentId);
          for (const { agent } of entries) observe(agent);
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "remove") remove(update.agentId);
          else observe(update.agent);
        },
      });
      return undefined;
    })
    .catch((error) => {
      if (!lifetime.signal.aborted) console.error("[link-tabs] Following agents failed", error);
    });

  return () => {
    lifetime.abort();
    for (const agentId of [...bars.keys()]) remove(agentId);
  };
}
