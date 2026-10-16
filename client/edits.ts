import { groupsOf, isBuiltIn } from "../shared/groups";
import type { ArrangedGroup, Group, Link, LinkValues } from "../shared/links";

/** Deletes links from one agent's list until the agent mentions them again. */
export function deleteLinks(values: LinkValues, agentId: string, links: readonly Link[]) {
  const deleted = Object.fromEntries(links.map(({ url, seq }) => [url, seq]));
  return {
    ...values,
    cleared: { ...values.cleared, [agentId]: { ...values.cleared[agentId], ...deleted } },
  };
}

/** Pins a link to the bar as a pill of its own, or unpins it. */
export function pinLink(values: LinkValues, url: string) {
  const pinned = values.pinnedLinks.includes(url);
  return {
    ...values,
    pinnedLinks: pinned
      ? values.pinnedLinks.filter((other) => other !== url)
      : [...values.pinnedLinks, url],
  };
}

/** Pins a group to the bar as a button of its own, or unpins it. */
export function pinGroup(values: LinkValues, id: string) {
  return {
    ...values,
    groups: groupsOf(values).map((group) =>
      group.id === id ? { ...group, pinned: !group.pinned } : group,
    ),
  };
}

export function addGroup(values: LinkValues, title: string, icon: string) {
  const group: Group = {
    id: `group-${Date.now().toString(36)}`,
    title,
    icon,
    pinned: false,
  };
  return { ...values, groups: [...groupsOf(values), group] };
}

/** Removes a group the user added. Its links go back to the groups for where they point. */
export function removeGroup(values: LinkValues, id: string) {
  if (isBuiltIn(id)) return values;
  const { [id]: _order, ...order } = values.order;
  const { [id]: _title, ...titles } = values.titles;
  return {
    ...values,
    groups: groupsOf(values).filter((group) => group.id !== id),
    placed: Object.fromEntries(Object.entries(values.placed).filter(([, group]) => group !== id)),
    order,
    titles,
  };
}

/** Sets or clears a name in a map of names; an empty name brings back the default. */
function named(names: Readonly<Record<string, string>>, key: string, name: string) {
  const { [key]: _old, ...rest } = names;
  return name.trim() ? { ...rest, [key]: name.trim() } : rest;
}

export function renameGroup(values: LinkValues, id: string, title: string) {
  return { ...values, titles: named(values.titles, id, title) };
}

export function renameLink(values: LinkValues, url: string, name: string) {
  return { ...values, names: named(values.names, url, name) };
}

/** Moves a group to `index` among the groups on screen. */
export function moveGroup(
  values: LinkValues,
  view: readonly ArrangedGroup[],
  id: string,
  index: number,
) {
  const others = view.filter((group) => group.id !== id);
  const before = others[index]?.id;
  const groups = groupsOf(values);
  const moved = groups.find((group) => group.id === id);
  if (!moved) return values;
  const rest = groups.filter((group) => group.id !== id);
  const at = before ? rest.findIndex((group) => group.id === before) : rest.length;
  return { ...values, groups: [...rest.slice(0, at), moved, ...rest.slice(at)] };
}

/** Moves a link into group `to`, at `index` among that group's links on screen. */
export function moveLink(
  values: LinkValues,
  view: readonly ArrangedGroup[],
  url: string,
  to: string,
  index: number,
) {
  const target = view.find((group) => group.id === to);
  if (!target) return values;
  const shown = target.links.map((link) => link.url).filter((other) => other !== url);
  shown.splice(index, 0, url);
  const order: Record<string, string[]> = {};
  for (const [group, urls] of Object.entries(values.order)) {
    order[group] = urls.filter((other) => other !== url);
  }
  order[to] = [...shown, ...(order[to] ?? []).filter((other) => !shown.includes(other))];
  return { ...values, placed: { ...values.placed, [url]: to }, order };
}
