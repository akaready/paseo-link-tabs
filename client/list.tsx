import {
  openExternalUrl,
  useRpc,
  useSettings,
  type PluginButtonContentProps,
} from "@getpaseo/plugin/client";
import { copyText, Icon, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  Text,
  View,
  type AccessibilityActionEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { arrange, GROUP_ICONS, isCleared } from "../shared/groups";
import {
  linkSettings,
  listLinks,
  type ArrangedGroup,
  type Link,
  type LinkValues,
} from "../shared/links";
import { DragRow } from "./drag";
import {
  addGroup,
  deleteLinks,
  moveGroup,
  moveLink,
  removeGroup,
  renameGroup,
  renameLink,
  pinLink,
  pinGroup,
} from "./edits";

type Props = PluginButtonContentProps & {
  onLinks(agentId: string, groups: readonly ArrangedGroup[]): void;
  /** Called after the user changes how links are organized. */
  onChange(): void;
};

/**
 * The Links pill's list: every link the agent shared, in groups. Rows and groups drag to reorder,
 * and links drag between groups. Each row has its buttons on the right: pin to the bar, copy,
 * rename, and delete from the list.
 */
export function LinkList(props: Props) {
  // Composer pills always target an agent.
  return props.context === "agent" ? <AgentLinks {...props} agentId={props.agentId} /> : null;
}

type Drag = { type: "group" | "link"; id: string; dy: number };
type Drop = { group: string; index: number; y: number } | { index: number; y: number };

/** A link shown whole, wrapping after its separators rather than mid-word. */
const breakable = (url: string) => url.replace(/([/?&=#])/g, "$1​");

const GROUP_GAP = 20;

/** The height of one item in a ⋮ menu, to place the menu before it renders. */
const MENU_ITEM = 34;

/**
 * One of a row's actions: a button on the row, or with `inMenu` an item in its ⋮ menu. `on`
 * marks a pin that is set; `off` dims a button that can't act.
 */
type Action = {
  icon: string;
  label: string;
  run(): void;
  on?: boolean;
  off?: boolean;
  inMenu?: boolean;
  danger?: boolean;
};

type Interaction = { pressed: boolean; hovered: boolean };

type HoverPressableProps = Omit<PressableProps, "style"> & {
  style: (state: Interaction) => StyleProp<ViewStyle>;
};

/**
 * A Pressable with hover, the way Paseo does it (its docs/hover.md): a plain View tracks hover
 * with pointer events, and the Pressable inside handles press. Pressable's own `hovered` exists
 * only on the web; pointer events reach the iPad's trackpad too.
 */
function HoverPressable({ style, ...pressable }: HoverPressableProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <View onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <Pressable {...pressable} style={({ pressed }) => style({ pressed, hovered })} />
    </View>
  );
}

/** A theme color at some opacity, which lightens or darkens any surface for hover and press. */
function tint(color: string, alpha: number, fallback: string) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return fallback;
  return `${color}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
}

function AgentLinks({
  agentId,
  theme,
  layout,
  close,
  onLinks,
  onChange,
}: Props & { agentId: string }) {
  const list = useRpc(listLinks);
  // Read again every time the list opens, which also catches links written mid-turn.
  const query = useQuery({ queryKey: ["links", agentId], queryFn: () => list({ agentId }) });
  const settings = useSettings(linkSettings);
  const toast = useToast();
  // A change shows at once and stays until it is saved, or reverts if saving fails.
  const [draft, setDraft] = useState<LinkValues | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState(GROUP_ICONS[0]!);
  /** The link row under the pointer, by row key. */
  const [hovered, setHovered] = useState<string | null>(null);
  /**
   * Rearranging, from Rearrange in any ⋮ menu: every row drags, and nothing else responds to a
   * press, so a drag never has to compete with opening a link or scrolling the list.
   */
  const [rearranging, setRearranging] = useState(false);
  /** The row whose ⋮ menu is open, and where the menu sits. */
  const [menu, setMenu] = useState<{ key: string; top: number; bottom: number } | null>(null);
  /** The list's height, to open a menu upward when it would run past the end. */
  const [height, setHeight] = useState(0);
  /** The row being renamed, by row key, and the name being typed. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const container = useRef<View>(null);
  /** Every row's view, and where each was when the current drag started. */
  const nodes = useRef(new Map<string, View>());
  const rows = useRef(new Map<string, { y: number; height: number }>());

  useEffect(() => {
    if (query.data) onLinks(agentId, query.data.groups);
  }, [query.data, agentId, onLinks]);

  const values = draft ?? (settings.status === "ready" ? settings.values : null);
  const view = useMemo(() => {
    if (!query.data) return [];
    if (!values) return query.data.groups;
    const cleared = values.cleared[agentId] ?? {};
    const links = query.data.groups.flatMap((group) => group.links);
    return arrange(
      links.filter((link) => !isCleared(link, cleared)),
      values,
    );
  }, [query.data, values, agentId]);

  const muted = theme.colors.foregroundMuted;
  const styles = useMemo(
    () => ({
      // Paseo's popover is 280 to 420 wide; the list fills it as its links need, and long URLs wrap.
      list: { paddingBottom: 4 },
      // Buttons line up on the right of every row, with room to the edge.
      header: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        paddingLeft: 8,
        paddingRight: 8,
        borderRadius: 6,
      },
      rearrangeBar: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        gap: 8,
        marginBottom: 12,
        paddingVertical: 6,
        paddingLeft: 10,
        paddingRight: 6,
        borderRadius: 8,
        backgroundColor: theme.colors.surface2,
      },
      rearrangeText: { color: theme.colors.foreground, fontSize: 13, userSelect: "none" as const },
      done: {
        paddingVertical: 5,
        paddingHorizontal: 12,
        borderRadius: 6,
        backgroundColor: theme.colors.accent,
      },
      doneText: {
        color: theme.colors.accentForeground,
        fontSize: 13,
        fontWeight: "600" as const,
        userSelect: "none" as const,
      },
      gap: { marginTop: GROUP_GAP },
      title: {
        color: theme.colors.foregroundMuted,
        userSelect: "none" as const,
        fontSize: 11,
        fontWeight: "600" as const,
        textTransform: "uppercase" as const,
        letterSpacing: 0.5,
      },
      count: { color: theme.colors.foregroundMuted, fontSize: 11, userSelect: "none" as const },
      spacer: { flexGrow: 1, minWidth: 16 },
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        paddingRight: 8,
        borderRadius: 6,
      },
      link: {
        flexGrow: 1,
        flexShrink: 1,
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 6,
      },
      hover: { backgroundColor: tint(theme.colors.foreground, 0.07, theme.colors.surface2) },
      press: { backgroundColor: tint(theme.colors.foreground, 0.13, theme.colors.surface2) },
      lifted: { backgroundColor: theme.colors.surface2, borderRadius: 6, zIndex: 1 },
      name: {
        color: theme.colors.foreground,
        fontSize: 13,
        fontWeight: "500" as const,
        userSelect: "none" as const,
      },
      url: { color: theme.colors.foreground, fontSize: 13, userSelect: "none" as const },
      secondary: { color: theme.colors.foregroundMuted, fontSize: 12 },
      action: { padding: 7, borderRadius: 6 },
      actions: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 2,
        marginLeft: 8,
      },
      dim: { opacity: 0.35 },
      backdrop: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 },
      menu: {
        position: "absolute" as const,
        right: 2,
        minWidth: 168,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        // A step lighter than the list, so the menu reads as raised above it.
        backgroundColor: theme.colors.surface2,
        zIndex: 10,
      },
      item: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        height: MENU_ITEM,
        paddingHorizontal: 10,
        marginHorizontal: 4,
        borderRadius: 6,
      },
      itemText: { fontSize: 13, userSelect: "none" as const },
      rename: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 4,
        flexGrow: 1,
        flexShrink: 1,
        paddingVertical: 2,
      },
      drop: {
        position: "absolute" as const,
        left: 0,
        right: 0,
        height: 2,
        borderRadius: 1,
        backgroundColor: theme.colors.accent,
      },
      note: { color: theme.colors.foregroundMuted, padding: 8 },
      add: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        marginTop: GROUP_GAP,
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 6,
      },
      addText: { color: theme.colors.foregroundMuted, fontSize: 13, userSelect: "none" as const },
      form: { marginTop: GROUP_GAP, gap: 8 },
      icons: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 4 },
      input: {
        flexGrow: 1,
        color: theme.colors.foreground,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 6,
        paddingVertical: 6,
        paddingHorizontal: 8,
        fontSize: 14,
      },
    }),
    [theme, layout.compact],
  );

  /** A button's style with hover and press feedback; `active` keeps it highlighted. */
  const feedback =
    (base: StyleProp<ViewStyle>, active = false) =>
    ({ pressed, hovered }: Interaction) => [
      base,
      hovered && styles.hover,
      (pressed || active) && styles.press,
    ];

  async function save(change: (values: LinkValues) => LinkValues) {
    if (settings.status !== "ready" || !values) return;
    const next = change(values);
    setDraft(next);
    const saved = await settings.save(next, settings.revision);
    setDraft(null);
    if (!saved) return toast.error("Could not save that. Try again.");
    onChange();
  }

  async function copy(links: readonly Link[]) {
    try {
      await copyText(links.map(({ url }) => url).join("\n"));
      toast.show(links.length === 1 ? "Link copied" : `${links.length} links copied`, {
        variant: "success",
      });
    } catch {
      toast.error("Could not copy.");
    }
  }

  function submitGroup() {
    const name = title.trim();
    if (!name) return;
    void save((current) => addGroup(current, name, icon));
    setAdding(false);
    setTitle("");
  }

  /** Where a drag would land, from the rows' measured positions. */
  function dropFor({ type, id, dy }: Drag): Drop | null {
    const box = (key: string) => rows.current.get(key);
    if (type === "group") {
      const blocks = view.map((group) => {
        const top = box(`g:${group.id}`);
        const last = box(`l:${group.links.at(-1)?.url}`) ?? top;
        return top && last ? { id: group.id, top: top.y, bottom: last.y + last.height } : null;
      });
      if (blocks.some((block) => !block)) return null;
      const dragged = blocks.find((block) => block!.id === id)!;
      const center = (dragged.top + dragged.bottom) / 2 + dy;
      const others = blocks.filter((block) => block!.id !== id) as {
        top: number;
        bottom: number;
      }[];
      const index = others.filter((block) => (block.top + block.bottom) / 2 < center).length;
      const y = others[index] ? others[index].top - GROUP_GAP / 2 : others.at(-1)!.bottom + 4;
      return { index, y };
    }
    const dragged = box(`l:${id}`);
    if (!dragged) return null;
    const center = dragged.y + dragged.height / 2 + dy;
    for (const [at, group] of view.entries()) {
      const header = box(`g:${group.id}`);
      if (!header) return null;
      if (header.y + header.height / 2 > center) {
        // Above a group's heading is the end of the group before it.
        const before = view[at - 1];
        if (!before) return { group: group.id, index: 0, y: header.y + header.height };
        const kept = before.links.filter((link) => link.url !== id);
        return { group: before.id, index: kept.length, y: header.y - GROUP_GAP / 2 };
      }
      const kept = group.links.filter((link) => link.url !== id);
      for (const [index, link] of kept.entries()) {
        const row = box(`l:${link.url}`);
        if (row && row.y + row.height / 2 > center) return { group: group.id, index, y: row.y };
      }
    }
    const last = view.at(-1);
    if (!last) return null;
    const kept = last.links.filter((link) => link.url !== id);
    const end = box(`l:${kept.at(-1)?.url}`) ?? box(`g:${last.id}`);
    return { group: last.id, index: kept.length, y: end ? end.y + end.height : 0 };
  }

  function finish(dragged: Drag) {
    setDrag(null);
    const drop = dropFor(dragged);
    if (!drop) return;
    if (dragged.type === "group") {
      const from = view.findIndex((group) => group.id === dragged.id);
      if (drop.index !== from)
        void save((current) => moveGroup(current, view, dragged.id, drop.index));
    } else if ("group" in drop) {
      const from = view.find((group) => group.links.some((link) => link.url === dragged.id));
      const at = from?.links.findIndex((link) => link.url === dragged.id);
      if (from?.id !== drop.group || at !== drop.index) {
        void save((current) => moveLink(current, view, dragged.id, drop.group, drop.index));
      }
    }
  }

  function step(type: Drag["type"], id: string, by: -1 | 1) {
    if (type === "group") {
      const from = view.findIndex((group) => group.id === id);
      const to = from + by;
      if (to >= 0 && to < view.length) void save((current) => moveGroup(current, view, id, to));
      return;
    }
    const group = view.find((candidate) => candidate.links.some((link) => link.url === id));
    if (!group) return;
    const to = group.links.findIndex((link) => link.url === id) + by;
    if (to >= 0 && to < group.links.length) {
      void save((current) => moveLink(current, view, id, group.id, to));
    }
  }

  /** What makes a row drag: measure the rows as it starts, follow it, drop it where it lands. */
  function dragging(type: Drag["type"], id: string, key: string) {
    return {
      nodeRef: track(key),
      active: rearranging,
      onStart: () => {
        measure();
        setDrag({ type, id, dy: 0 });
      },
      onMove: (dy: number) => setDrag({ type, id, dy }),
      onEnd: (dy: number) => finish({ type, id, dy }),
    };
  }

  /** Move up and move down for screen readers, since rows drag by touch or pointer. */
  function movable(type: Drag["type"], id: string) {
    return {
      accessibilityActions: [
        { name: "decrement", label: "Move up" },
        { name: "increment", label: "Move down" },
      ],
      onAccessibilityAction: ({ nativeEvent }: AccessibilityActionEvent) =>
        step(type, id, nativeEvent.actionName === "decrement" ? -1 : 1),
    };
  }

  // Rows are measured when a drag starts: on the web, onLayout misses a row that moves without
  // changing size, as rows do when a group above them empties.
  function measure() {
    const parent = container.current;
    if (!parent) return;
    rows.current.clear();
    for (const [key, node] of nodes.current) {
      node.measureLayout(
        parent,
        (_x, y, _width, height) => rows.current.set(key, { y, height }),
        () => {},
      );
    }
  }

  function track(key: string) {
    return (node: View | null) => {
      if (node) nodes.current.set(key, node);
      else nodes.current.delete(key);
    };
  }

  const busy = settings.status !== "ready" || settings.saving;
  const strong = theme.colors.foreground;

  function iconButton(icon: string, label: string, onPress: () => void, color = muted) {
    return (
      <HoverPressable
        accessibilityRole="button"
        accessibilityLabel={label}
        style={feedback(styles.action)}
        onPress={onPress}
      >
        <Icon name={icon} size={16} color={color} />
      </HoverPressable>
    );
  }

  /** A row's actions: pin to the bar and copy on the row; rename and delete in its ⋮ menu. */
  function actionsFor(key: string): Action[] {
    for (const group of view) {
      const name = group.title.toLowerCase();
      if (key === `g:${group.id}`) {
        return [
          {
            icon: "Pin",
            label: group.pinned ? `Unpin ${name} from the bar` : `Pin ${name} to the bar`,
            on: group.pinned,
            run: () => void save((current) => pinGroup(current, group.id)),
          },
          {
            icon: "Copy",
            label: `Copy all ${name} links`,
            off: !group.links.length,
            run: () => void copy(group.links),
          },
          {
            icon: "ArrowUpDown",
            label: "Rearrange",
            inMenu: true,
            run: () => setRearranging(true),
          },
          {
            icon: "Pencil",
            label: "Rename",
            inMenu: true,
            run: () => startRename(key, group.title),
          },
          {
            icon: "Trash2",
            label: group.links.length ? "Delete links" : "Delete group",
            inMenu: true,
            danger: true,
            run: () =>
              void save((current) =>
                group.links.length
                  ? deleteLinks(current, agentId, group.links)
                  : removeGroup(current, group.id),
              ),
          },
        ];
      }
      const link = group.links.find((candidate) => key === `l:${candidate.url}`);
      if (link) {
        return [
          {
            icon: "Pin",
            label: link.pinned ? `Unpin ${link.url} from the bar` : `Pin ${link.url} to the bar`,
            on: link.pinned,
            run: () => void save((current) => pinLink(current, link.url)),
          },
          { icon: "Copy", label: `Copy ${link.url}`, run: () => void copy([link]) },
          {
            icon: "ArrowUpDown",
            label: "Rearrange",
            inMenu: true,
            run: () => setRearranging(true),
          },
          {
            icon: "Pencil",
            label: "Rename",
            inMenu: true,
            run: () => startRename(key, link.name ?? ""),
          },
          {
            icon: "Trash2",
            label: "Delete",
            inMenu: true,
            danger: true,
            run: () => void save((current) => deleteLinks(current, agentId, [link])),
          },
        ];
      }
    }
    return [];
  }

  /** A row's buttons, in the same columns on every row: pin, copy, and its ⋮ menu. */
  function actions(key: string, label: string) {
    // While rearranging, the buttons give way to a grip: the whole row drags.
    if (rearranging) {
      return (
        <View style={styles.actions}>
          <View style={styles.action}>
            <Icon name="GripVertical" size={16} color={muted} />
          </View>
        </View>
      );
    }
    return (
      <View style={styles.actions}>
        {actionsFor(key)
          .filter((action) => !action.inMenu)
          .map(({ icon, label, run, on, off }) => (
            <HoverPressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={on === undefined ? undefined : { selected: on }}
              disabled={busy || off}
              style={feedback([styles.action, off && styles.dim])}
              onPress={run}
            >
              <Icon name={icon} size={16} color={on ? theme.colors.accent : muted} />
            </HoverPressable>
          ))}
        <HoverPressable
          accessibilityRole="button"
          accessibilityLabel={`More for ${label}`}
          accessibilityState={{ expanded: menu?.key === key }}
          style={feedback(styles.action, menu?.key === key)}
          onPress={() => {
            setRenaming(null);
            if (menu?.key === key) setMenu(null);
            else openMenu(key);
          }}
        >
          <Icon name="EllipsisVertical" size={16} color={menu?.key === key ? strong : muted} />
        </HoverPressable>
      </View>
    );
  }

  /**
   * Opens a row's ⋮ menu over the list, below the row, or above it when the list ends too soon.
   * Nothing under it moves.
   */
  function openMenu(key: string) {
    const node = nodes.current.get(key);
    const parent = container.current;
    if (!node || !parent) return;
    const tall = actionsFor(key).filter((action) => action.inMenu).length * MENU_ITEM + 10;
    node.measureLayout(
      parent,
      (_x, y, _width, rowHeight) => {
        const below = y + rowHeight + 2;
        const top = below + tall > height && y - tall - 2 >= 0 ? y - tall - 2 : below;
        setMenu({ key, top, bottom: top + tall });
      },
      () => {},
    );
  }

  function startRename(key: string, current: string) {
    setRenaming(key);
    setName(current);
  }

  /** An inline name field; an empty name brings back the default. */
  function renameField(placeholder: string, onSave: (name: string) => void) {
    const submit = () => {
      onSave(name);
      setRenaming(null);
    };
    return (
      <View style={styles.rename}>
        <TextInput
          autoFocus
          selectTextOnFocus
          value={name}
          onChangeText={setName}
          onSubmitEditing={submit}
          placeholder={placeholder}
          placeholderTextColor={muted}
          style={styles.input}
        />
        {iconButton("Check", "Save the name", submit, strong)}
        {iconButton("X", "Cancel renaming", () => setRenaming(null))}
      </View>
    );
  }

  if (query.isPending) return <Text style={styles.note}>Reading links…</Text>;
  if (query.isError) return <Text style={styles.note}>Could not read this chat's links.</Text>;

  const lift = (moving: boolean) =>
    moving && drag ? [styles.lifted, { transform: [{ translateY: drag.dy }] }] : null;
  const drop = drag && drag.dy !== 0 ? dropFor(drag) : null;

  return (
    <View
      ref={container}
      onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}
      // An open menu past the end of a short list grows the list rather than being cut off.
      style={[styles.list, menu ? { minHeight: menu.bottom + 4 } : null]}
    >
      {rearranging ? (
        <View style={styles.rearrangeBar}>
          <Text style={styles.rearrangeText}>Drag links and groups to rearrange</Text>
          <HoverPressable
            accessibilityRole="button"
            accessibilityLabel="Done rearranging"
            style={feedback(styles.done)}
            onPress={() => setRearranging(false)}
          >
            <Text style={styles.doneText}>Done</Text>
          </HoverPressable>
        </View>
      ) : null}
      {view.length === 0 ? <Text style={styles.note}>No links in this chat yet.</Text> : null}
      {view.flatMap((group, at) => {
        const groupMoving = drag?.type === "group" && drag.id === group.id;
        const key = `g:${group.id}`;
        return [
          <DragRow
            key={key}
            {...dragging("group", group.id, key)}
            style={[styles.header, at > 0 && styles.gap, lift(groupMoving)]}
          >
            <Icon name={group.icon} size={14} color={muted} />
            {renaming === key ? (
              renameField(
                "Group name",
                (title) => void save((current) => renameGroup(current, group.id, title)),
              )
            ) : (
              <>
                <Text
                  style={styles.title}
                  accessibilityRole="header"
                  {...movable("group", group.id)}
                >
                  {group.title}
                </Text>
                <Text style={styles.count}>{group.links.length}</Text>
                <View style={styles.spacer} />
                {actions(key, group.title)}
              </>
            )}
          </DragRow>,
          ...group.links.map((link) => {
            const row = `l:${link.url}`;
            return (
              // The whole row lights up on hover, the way Paseo does it: pointer events on a plain
              // View, with its buttons inside.
              <DragRow
                key={row}
                {...dragging("link", link.url, row)}
                onPointerEnter={() => setHovered(row)}
                onPointerLeave={() => setHovered((current) => (current === row ? null : current))}
                style={[
                  styles.row,
                  hovered === row && styles.hover,
                  lift(groupMoving || (drag?.type === "link" && drag.id === link.url)),
                ]}
              >
                {renaming === row ? (
                  renameField(
                    "Link name",
                    (named) => void save((current) => renameLink(current, link.url, named)),
                  )
                ) : (
                  <>
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={`Open ${link.url}`}
                      {...movable("link", link.url)}
                      disabled={rearranging}
                      style={({ pressed }) => [styles.link, pressed && styles.press]}
                      onPress={() => {
                        void openExternalUrl(link.url);
                        close();
                      }}
                    >
                      {link.name ? <Text style={styles.name}>{link.name}</Text> : null}
                      <Text style={[styles.url, link.name ? styles.secondary : null]}>
                        {breakable(link.url)}
                      </Text>
                    </Pressable>
                    {actions(row, link.name ?? link.url)}
                  </>
                )}
              </DragRow>
            );
          }),
        ];
      })}
      {drop ? <View pointerEvents="none" style={[styles.drop, { top: drop.y - 1 }]} /> : null}
      {adding ? (
        <View style={styles.form}>
          <View style={styles.icons}>
            {GROUP_ICONS.map((choice) => (
              <HoverPressable
                key={choice}
                accessibilityRole="button"
                accessibilityLabel={`${choice} icon`}
                accessibilityState={{ selected: choice === icon }}
                style={feedback(styles.action, choice === icon)}
                onPress={() => setIcon(choice)}
              >
                <Icon name={choice} size={16} color={choice === icon ? strong : muted} />
              </HoverPressable>
            ))}
          </View>
          <View style={styles.header}>
            <TextInput
              autoFocus
              value={title}
              onChangeText={setTitle}
              onSubmitEditing={submitGroup}
              placeholder="Group name"
              placeholderTextColor={muted}
              style={styles.input}
            />
            {iconButton("Check", "Add the group", submitGroup, strong)}
            {iconButton("X", "Cancel", () => setAdding(false))}
          </View>
        </View>
      ) : (
        <HoverPressable
          accessibilityRole="button"
          style={feedback(styles.add)}
          onPress={() => setAdding(true)}
        >
          <Icon name="Plus" size={14} color={muted} />
          <Text style={styles.addText}>New group</Text>
        </HoverPressable>
      )}
      {menu ? (
        <>
          <Pressable
            accessibilityLabel="Close menu"
            style={styles.backdrop}
            onPress={() => setMenu(null)}
          />
          <View accessibilityRole="menu" style={[styles.menu, { top: menu.top }]}>
            {actionsFor(menu.key)
              .filter((action) => action.inMenu)
              .map(({ icon, label, run, danger }) => {
                const color = danger ? theme.colors.statusDanger : strong;
                return (
                  <HoverPressable
                    key={label}
                    accessibilityRole="menuitem"
                    accessibilityLabel={label}
                    disabled={busy}
                    style={feedback(styles.item)}
                    onPress={() => {
                      setMenu(null);
                      run();
                    }}
                  >
                    <Icon name={icon} size={14} color={color} />
                    <Text style={[styles.itemText, { color }]}>{label}</Text>
                  </HoverPressable>
                );
              })}
          </View>
        </>
      ) : null}
    </View>
  );
}
