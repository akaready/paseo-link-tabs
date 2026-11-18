import { useRpc, useSettings, type PluginButtonContentProps } from "@getpaseo/plugin/client";
import { copyText, Icon, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Platform,
  Pressable,
  Text,
  View,
  type AccessibilityActionEvent,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { arrange, fadeOf, GROUP_ICONS, isCleared, labelOf } from "../shared/groups";
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
import { fadeTextTail, holdEscape, fadeToBackground } from "./web";

type Props = PluginButtonContentProps & {
  onLinks(agentId: string, groups: readonly ArrangedGroup[]): void;
  /** Opens a link the way a tap should: in Paseo's browser, through the Link preview panel. */
  onOpen(link: Link): void;
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

/** What a row shows, copies, and names: a local file's path, else the link itself. */
const targetOf = (link: Link) => link.path ?? link.url;

/**
 * A field laid exactly over the text it edits: the text stays where it was, hidden, so the row
 * keeps its size and nothing moves when editing starts or stops.
 */
function InlineEdit({
  value,
  onChange,
  onCommit,
  onCancel,
  placeholder,
  color,
  font,
}: {
  value: string;
  onChange(text: string): void;
  onCommit(text: string): void;
  onCancel(): void;
  placeholder: string;
  color: string;
  font: StyleProp<TextStyle>;
}) {
  const finished = useRef(false);
  const finish = (commit: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (commit) onCommit(value);
    else onCancel();
  };
  useEffect(() => holdEscape(() => finish(false)), []);

  return (
    <TextInput
      autoFocus
      selectTextOnFocus
      value={value}
      onChangeText={onChange}
      onSubmitEditing={() => finish(true)}
      onBlur={() => finish(true)}
      placeholder={placeholder}
      placeholderTextColor={color}
      style={[inlineEditStyles.field, font, { color }]}
    />
  );
}

const inlineEditStyles = {
  field: {
    position: "absolute" as const,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: "transparent" as const,
    outlineWidth: 0,
    textAlignVertical: "center" as const,
  },
};

/**
 * A group's links, opening and closing in place. Its height is measured from the rows themselves,
 * so a group with two lines and a group with twenty both animate to their own size.
 */
function GroupBody({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  const progress = useRef(new Animated.Value(collapsed ? 0 : 1)).current;
  const [height, setHeight] = useState(0);
  useEffect(() => {
    Animated.timing(progress, {
      toValue: collapsed ? 0 : 1,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [collapsed, progress]);
  return (
    <Animated.View
      style={{
        overflow: "hidden",
        height: height
          ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, height] })
          : collapsed
            ? 0
            : undefined,
      }}
      pointerEvents={collapsed ? "none" : "auto"}
    >
      <View onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}>{children}</View>
    </Animated.View>
  );
}

/** A drawn checkbox: a square outline, filled in only by its tick. No icon glyph, no accent. */
function Checkbox({
  checked,
  color,
  edge,
}: {
  checked: boolean;
  color: string;
  edge: string;
}) {
  return (
    <View style={[checkboxStyles.box, { borderColor: checked ? color : edge }]}>
      {checked ? <View style={[checkboxStyles.tick, { borderColor: color }]} /> : null}
    </View>
  );
}

const checkboxStyles = {
  box: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  // Two edges of a small box, turned, make the tick.
  tick: {
    width: 5,
    height: 9,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    transform: [{ rotate: "45deg" }],
    marginTop: -2,
  },
};

/**
 * The part of a row the buttons sit over. On the web its tail fades out while they are showing,
 * so the row gives its whole width to the link when nothing is hovering it.
 */
function FadeTail({
  active,
  fade = ACTION_FADE,
  clear = ACTION_CLEAR,
  style,
  children,
}: {
  active: boolean;
  /** Where the fade begins and where the text is gone, from the right edge. */
  fade?: number;
  clear?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const node = useRef<View>(null);
  useEffect(() => {
    fadeTextTail(node.current, active ? fade : 0, clear);
  }, [active, fade, clear]);
  return (
    <View ref={node} style={style}>
      {children}
    </View>
  );
}

/**
 * The footer, stuck to the bottom of whatever scrolls the list, over a fade into the surface, so
 * rows melt away behind its buttons. Only the web can stick; elsewhere it follows the list.
 */
function StickyFooter({ surface, children }: { surface: string; children: ReactNode }) {
  if (Platform.OS !== "web") return <>{children}</>;
  return <WebStickyFooter surface={surface}>{children}</WebStickyFooter>;
}

function WebStickyFooter({ surface, children }: { surface: string; children: ReactNode }) {
  const blur = useRef<View>(null);
  // The surface colour is a dependency so a theme change paints the fade again.
  useEffect(() => fadeToBackground(blur.current), [surface]);
  return (
    <View style={stickyStyles.footer}>
      <View ref={blur} pointerEvents="none" style={stickyStyles.blur} />
      {children}
    </View>
  );
}

const stickyStyles = {
  // `sticky` is web-only CSS that React Native's styles do not list. `bottom: 4` is where the
  // footer naturally ends (4 above the scroller edge), so it does not shift when the list scrolls
  // to its end; the fade reaches 4 further down to cover the strip left under it.
  footer: { position: "sticky", bottom: 4, zIndex: 1 } as unknown as ViewStyle,
  blur: { position: "absolute" as const, top: -14, left: -12, right: -12, bottom: -4 },
};

const GROUP_GAP = 16;

/** Where the fade under the hovering buttons starts, and where the text is gone, from the right. */
const ACTION_FADE = 124;
const ACTION_CLEAR = 84;
/** A pinned row shows only its pin, so only that much of the text gives way. */
const PIN_FADE = 44;
const PIN_CLEAR = 28;

/**
 * One of a row's actions: a button on the row. `on` marks a pin that is set; `off` dims a button
 * that can't act.
 */
type Action = {
  icon: string;
  label: string;
  run(): void;
  on?: boolean;
  off?: boolean;
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
  onOpen,
  onChange,
}: Props & { agentId: string }) {
  const list = useRpc(listLinks);
  // Read again every time the list opens, which also catches links written mid-turn.
  // Not on focus or reconnect: a list that was drawn stays as it is until it is opened again.
  const query = useQuery({
    queryKey: ["links", agentId],
    queryFn: () => list({ agentId }),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
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
   * Rearranging, from the button beside New group: every row drags, and nothing else responds to
   * a press, so a drag never has to compete with opening a link or scrolling the list.
   */
  const [rearranging, setRearranging] = useState(false);
  /**
   * Deleting: rows pick links instead of opening them, across every group, and the footer asks
   * twice before anything goes.
   */
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /**
   * Groups the user flipped from how they start, by group ID. A group starts open, or closed when
   * all its links are archived.
   */
  const [flipped, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  /** Groups whose Archive row is open, by group ID. */
  const [archiveOpen, setArchiveOpen] = useState<ReadonlySet<string>>(new Set());
  /** The row whose copy button just fired, so its icon can acknowledge it. */
  const [copiedRow, setCopiedRow] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The row being renamed, by row key, and the name being typed. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const container = useRef<View>(null);
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );
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
      // The popover's own box: the menu and its backdrop are placed against this one, so they line
      // up with the popover rather than with the rows.
      list: {},
      // Paseo wraps plugin popover content in 12 of padding and a gap, and its own panel rows have
      // neither, so the rows take that padding back to sit on the same rails as the sub-agents.
      // Paseo's own panel rows are flush to the panel at the top and bottom and inset 4 at the
      // sides, so that is what this is too.
      rails: { marginHorizontal: -12, marginTop: -12, marginBottom: -12 },
      // Paseo's own panel rows: 32 tall, inset 4 from the panel edge, 8 in and 4 down inside.
      header: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        minHeight: 32,
        marginHorizontal: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
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
      // The page title under a link, quieter than the link itself.
      pageTitle: {
        color: theme.colors.foregroundMuted,
        fontSize: 11,
        userSelect: "none" as const,
      },
      count: { color: theme.colors.foregroundMuted, fontSize: 11, userSelect: "none" as const },
      // The row's own content, which gives way to the buttons floating over its tail.
      headerTail: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 0,
      },
      linkTail: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
      // The whole header is the target that opens and closes the group, its padding included.
      headerPress: {
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 0,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        marginHorizontal: -8,
        marginVertical: -4,
        paddingHorizontal: 8,
        paddingVertical: 4,
      },
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        minHeight: 32,
        marginHorizontal: 4,
        paddingRight: 4,
        borderRadius: 8,
      },
      link: {
        flexGrow: 1,
        flexShrink: 1,
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 6,
      },
      hover: { backgroundColor: tint(theme.colors.foreground, 0.07, theme.colors.surface2) },
      archivePress: {
        flexGrow: 1,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        paddingVertical: 6,
        paddingHorizontal: 8,
      },
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
      action: { padding: 5, borderRadius: 6 },
      actions: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 4,
        marginLeft: 4,
      },
      // Floating over the row's tail, so nothing is reserved for it while it is hidden.
      actionsOverlay: {
        position: "absolute" as const,
        top: 0,
        bottom: 0,
        right: 4,
        justifyContent: "center" as const,
        // Above the row's own pressable, which spans the whole row.
        zIndex: 2,
      },
      // The other buttons sit to the left of a pin that is always there.
      actionsBeforePin: { right: 32 },
      // Faded out rather than unmounted, so revealing the buttons never resizes the row.
      actionsHidden: { opacity: 0 },
      dim: { opacity: 0.35 },
      // A link row's content: a leading slot that holds the pick box or the drag handle, then its
      // name and link. The slot is always there, empty, so neither mode moves anything.
      linkBody: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      linkColumn: { flexShrink: 1 },
      // A text and its field share one box, so editing never changes the row's size.
      editWrap: { position: "relative" as const, flexShrink: 1 },
      invisible: { opacity: 0 },
      lead: { width: 16, alignItems: "center" as const, justifyContent: "center" as const },
      // What the leading slot holds when no mode is on: a bullet, so the indent reads as a row
      // marker rather than a gap.
      bullet: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: theme.colors.foregroundMuted,
        opacity: 0.5,
      },
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
        // The rows sit in the popover's padding, and this line marks them.
        left: -12,
        right: -12,
        height: 2,
        borderRadius: 1,
        backgroundColor: theme.colors.accent,
      },
      note: { color: theme.colors.foregroundMuted, padding: 8 },
      // New group on the left, Rearrange on the right edge, on the same rail as the rows.
      footer: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        marginTop: 10,
        marginHorizontal: 4,
      },
      // The button and the view that tracks the pointer both hug the label, so the hover only
      // happens over the button and never over the empty row beside it.
      // Aligned to the row edge, so the plus sits in the same column as the bullets.
      addRow: { alignSelf: "flex-start" as const },
      spacer: { flexGrow: 1 },
      // Lines the button up with the ⋮ column of the rows above it.
      footerAction: { marginRight: 4 },
      add: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        alignSelf: "flex-start" as const,
        gap: 8,
        minHeight: 32,
        paddingHorizontal: 8,
        borderRadius: 8,
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
      await copyText(links.map(targetOf).join("\n"));
      toast.show(links.length === 1 ? "Link copied" : `${links.length} links copied`, {
        variant: "success",
      });
    } catch {
      toast.error("Could not copy.");
    }
  }

  function stopDeleting() {
    setDeleting(false);
    setSelected(new Set());
  }

  /** Deletes every picked link, wherever it sits, and leaves the pick mode. */
  function deleteSelected() {
    const links = view.flatMap((group) => group.links).filter((link) => selected.has(link.url));
    if (!links.length) return;
    stopDeleting();
    toast.show(links.length === 1 ? "Link deleted" : `${links.length} links deleted`, {
      variant: "success",
    });
    void save((current) => deleteLinks(current, agentId, links));
  }

  function pick(link: Link) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(link.url)) next.delete(link.url);
      else next.add(link.url);
      return next;
    });
  }

  /** Picks every link in a group, or none of them when all are already picked. */
  function pickGroup(group: ArrangedGroup) {
    setSelected((current) => {
      const next = new Set(current);
      const all = group.links.every((link) => next.has(link.url));
      for (const link of group.links) {
        if (all) next.delete(link.url);
        else next.add(link.url);
      }
      return next;
    });
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
  const hasLinks = view.some((group) => group.links.length > 0);
  /**
   * Where hovering is possible, the buttons float over the row's tail instead of holding a column
   * of their own, so a link gets the whole width until you point at it. The touch clients have no
   * hover, so there the buttons stay in the row and are always shown.
   */
  const overlayActions = !layout.compact && layout.platform === "web";

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

  /** Whether a row shows its buttons: always where nothing can hover, else on hover or on demand. */
  function revealedFor(key: string) {
    return (
      !deleting &&
      (!overlayActions || hovered === key || renaming === key || rearranging)
    );
  }

  /** A row's actions, all of them buttons on the row: pin, copy, open, and rename. */
  function actionsFor(key: string): Action[] {
    for (const group of view) {
      const name = group.title.toLowerCase();
      if (key === `g:${group.id}`) {
        return [
          {
            icon: "Pencil",
            label: "Rename",
            run: () => startRename(key, group.title),
          },
          {
            icon: "Pin",
            label: group.pinned ? `Unpin ${name} from the bar` : `Pin ${name} to the bar`,
            on: group.pinned,
            run: () => void save((current) => pinGroup(current, group.id)),
          },
        ];
      }
      const link = group.links.find((candidate) => key === `l:${candidate.url}`);
      if (link) {
        const target = targetOf(link);
        return [
          {
            icon: "Pencil",
            label: "Rename",
            run: () => startRename(key, link.name ?? targetOf(link)),
          },
          {
            icon: "Copy",
            label: `Copy ${target}`,
            run: () => {
              void copy([link]);
              flashCopied(key);
            },
          },
          {
            icon: "Pin",
            label: link.pinned ? `Unpin ${target} from the bar` : `Pin ${target} to the bar`,
            on: link.pinned,
            run: () => void save((current) => pinLink(current, link.url)),
          },
        ];
      }
    }
    return [];
  }

  /** A row's buttons, in the same columns on every row. */
  function actions(key: string, label: string) {
    // While rearranging the handle sits in the row's leading slot, so nothing is drawn here.
    if (rearranging) return null;
    // A row that is being renamed keeps its field to itself.
    if (renaming === key || deleting) return null;
    const list = actionsFor(key);
    const pin = list.find((action) => action.icon === "Pin");
    const rest = list.filter((action) => action !== pin);
    const pinned = Boolean(pin?.on);
    const revealed = revealedFor(key);
    const cluster = (actions: Action[], shown: boolean, right: number) => (
      <View
        style={[
          styles.actions,
          overlayActions && [styles.actionsOverlay, { right }],
          shown ? null : styles.actionsHidden,
        ]}
        pointerEvents={shown ? "auto" : "none"}
      >
        {actions.map(({ icon, label, run, on, off }) => {
          const copied = icon === "Copy" && copiedRow === key;
          return (
            <HoverPressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={on === undefined ? undefined : { selected: on }}
              disabled={busy || off}
              style={feedback([styles.action, off && styles.dim])}
              onPress={run}
            >
              <Icon
                name={copied ? "Check" : icon}
                size={14}
                color={on || copied ? strong : muted}
              />
            </HoverPressable>
          );
        })}
      </View>
    );
    // Pinned: the pin alone, always; the others hover in to its left.
    if (pinned && pin) {
      return (
        <>
          {cluster(rest, revealed, 32)}
          {cluster([pin], true, 4)}
        </>
      );
    }
    return cluster(list, revealed, 4);
  }

  /** Shows a tick in place of the copy glyph for a moment, so the press is acknowledged. */
  function flashCopied(key: string) {
    setCopiedRow(key);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedRow(null), 900);
  }

  function toggleArchive(id: string) {
    setArchiveOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const isClosed = (group: ArrangedGroup) =>
    (group.links.length > 0 && group.links.every((link) => link.archived)) !==
    flipped.has(group.id);

  function toggleGroup(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startRename(key: string, current: string) {
    setRenaming(key);
    setName(current);
  }

  if (query.isPending) return <Text style={styles.note}>Reading links…</Text>;
  if (query.isError) return <Text style={styles.note}>Could not read this chat's links.</Text>;

  const lift = (moving: boolean) =>
    moving && drag ? [styles.lifted, { transform: [{ translateY: drag.dy }] }] : null;
  const drop = drag && drag.dy !== 0 ? dropFor(drag) : null;
  // Rows fade by age against the others in this chat's list; archived ones are not counted.
  const seen = view.flatMap((group) =>
    group.links.flatMap((link) => (link.archived || link.seenAt === undefined ? [] : [link.seenAt])),
  );
  const newest = Math.max(...seen);
  const oldest = Math.min(...seen);

  return (
    <View
      ref={container}
      style={styles.list}
    >
      <View style={styles.rails}>
          {view.length === 0 ? <Text style={styles.note}>No links in this chat yet.</Text> : null}
        {view.flatMap((group, at) => {
          const groupMoving = drag?.type === "group" && drag.id === group.id;
          const key = `g:${group.id}`;
          const items = [
            <DragRow
              key={key}
              {...dragging("group", group.id, key)}
              onPointerEnter={() => setHovered(key)}
              onPointerLeave={() => setHovered((current) => (current === key ? null : current))}
              style={[
                styles.header,
                hovered === key && styles.hover,
                at > 0 && styles.gap,
                lift(groupMoving),
              ]}
            >
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${isClosed(group) ? "Open" : "Close"} ${group.title}`}
                  accessibilityState={{ expanded: !isClosed(group) }}
                  disabled={rearranging || renaming === key}
                  style={styles.headerPress}
                  onPress={() => toggleGroup(group.id)}
                >
                <FadeTail
                  active={overlayActions && !rearranging && revealedFor(key)}
                  style={styles.headerTail}
                >
                  {/* Hovering swaps the group's icon for the chevron that opens or closes it. */}
                  <View style={styles.lead}>
                    {deleting && group.links.length > 0 ? (
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityLabel={`Select all links in ${group.title}`}
                        accessibilityState={{
                          checked: group.links.every((link) => selected.has(link.url)),
                        }}
                        hitSlop={8}
                        onPress={() => pickGroup(group)}
                      >
                        <Checkbox
                          checked={group.links.every((link) => selected.has(link.url))}
                          color={strong}
                          edge={muted}
                        />
                      </Pressable>
                    ) : hovered === key && !rearranging && !deleting ? (
                      <Icon
                        name={isClosed(group) ? "ChevronRight" : "ChevronDown"}
                        size={14}
                        color={muted}
                      />
                    ) : (
                      <Icon name={group.icon} size={14} color={muted} />
                    )}
                  </View>
                  <View style={styles.editWrap}>
                    <Text
                      style={[styles.title, renaming === key && styles.invisible]}
                      accessibilityRole="header"
                      {...movable("group", group.id)}
                    >
                      {group.title}
                    </Text>
                    {renaming === key ? (
                      <InlineEdit
                        value={name}
                        onChange={setName}
                        onCommit={(title) => {
                          setRenaming(null);
                          void save((current) => renameGroup(current, group.id, title));
                        }}
                        onCancel={() => setRenaming(null)}
                        placeholder="Group name"
                        color={strong}
                        font={styles.title}
                      />
                    ) : null}
                  </View>
                  <Text style={styles.count}>{group.links.length}</Text>
                </FadeTail>
                {actions(key, group.title)}
                </Pressable>
              </>
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
                    hovered === row || renaming === row || selected.has(link.url)
                      ? null
                      : { opacity: fadeOf(link.seenAt, newest, oldest) },
                    lift(groupMoving || (drag?.type === "link" && drag.id === link.url)),
                  ]}
                >
                      <FadeTail
                        active={
                          overlayActions &&
                          !rearranging &&
                          renaming !== row &&
                          (revealedFor(row) || link.pinned)
                        }
                        fade={link.pinned && !revealedFor(row) ? PIN_FADE : ACTION_FADE}
                        clear={link.pinned && !revealedFor(row) ? PIN_CLEAR : ACTION_CLEAR}
                        style={styles.linkTail}
                      >
                        <Pressable
                          accessibilityRole={deleting ? "checkbox" : "link"}
                          accessibilityLabel={
                            deleting ? `Pick ${targetOf(link)}` : `Open ${targetOf(link)}`
                          }
                          accessibilityState={
                            deleting ? { checked: selected.has(link.url) } : undefined
                          }
                          // React Native Web leaves `checked` off the element, and this is a pick
                          // box, so the state is spelled out for the web.
                          {...(Platform.OS === "web"
                            ? { "aria-checked": selected.has(link.url) }
                            : null)}
                          {...movable("link", link.url)}
                          disabled={rearranging}
                          style={({ pressed }) => [styles.link, pressed && styles.press]}
                          onPress={() => {
                            if (renaming === row) return;
                            if (deleting) {
                              pick(link);
                              return;
                            }
                            close();
                            onOpen(link);
                          }}
                        >
                          <View style={styles.linkBody}>
                            <View style={styles.lead}>
                              {deleting ? (
                                <Checkbox
                                  checked={selected.has(link.url)}
                                  color={strong}
                                  edge={muted}
                                />
                              ) : rearranging ? (
                                <Icon name="GripVertical" size={16} color={muted} />
                              ) : (
                                <View style={styles.bullet} />
                              )}
                            </View>
                            <View style={styles.linkColumn}>
                              {link.name ? (
                                <View style={styles.editWrap}>
                                  <Text
                                    style={[styles.name, renaming === row && styles.invisible]}
                                  >
                                    {link.name}
                                  </Text>
                                  {renaming === row ? (
                                    <InlineEdit
                                      value={name}
                                      onChange={setName}
                                      onCommit={(named) => {
                                        setRenaming(null);
                                        void save((current) =>
                                          renameLink(
                                            current,
                                            link.url,
                                            named === targetOf(link) ? "" : named,
                                          ),
                                        );
                                      }}
                                      onCancel={() => setRenaming(null)}
                                      placeholder="Link name"
                                      color={strong}
                                      font={styles.name}
                                    />
                                  ) : null}
                                </View>
                              ) : null}
                              <View style={styles.editWrap}>
                                <Text
                                  style={[
                                    styles.url,
                                    link.name ? styles.secondary : null,
                                    renaming === row && !link.name && styles.invisible,
                                  ]}
                                >
                                  {breakable(targetOf(link))}
                                </Text>
                                {renaming === row && !link.name ? (
                                  <InlineEdit
                                    value={name}
                                    onChange={setName}
                                    onCommit={(named) => {
                                      setRenaming(null);
                                      void save((current) =>
                                        renameLink(
                                          current,
                                          link.url,
                                          named === targetOf(link) ? "" : named,
                                        ),
                                      );
                                    }}
                                    onCancel={() => setRenaming(null)}
                                    placeholder="Link name"
                                    color={strong}
                                    font={styles.url}
                                  />
                                ) : null}
                              </View>
                              {link.title &&
                              link.title !== link.name &&
                              link.title !== labelOf(link.url) ? (
                                <Text numberOfLines={1} style={styles.pageTitle}>
                                  {link.title}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        </Pressable>
                      </FadeTail>
                      {actions(row, link.name ?? targetOf(link))}
                </DragRow>
              );
            }),
          ];
          // Archived links are last in the group, so the rows split where the archive starts.
          const shown = group.links.filter((link) => !link.archived).length;
          const archived = group.links.length - shown;
          const archiveKey = `a:${group.id}`;
          const archiveIsOpen = archiveOpen.has(group.id);
          return [
            items[0],
            <GroupBody key={`${group.id}:body`} collapsed={isClosed(group)}>
              {items.slice(1, 1 + shown)}
              {archived > 0 ? (
                <View
                  key={archiveKey}
                  onPointerEnter={() => setHovered(archiveKey)}
                  onPointerLeave={() =>
                    setHovered((current) => (current === archiveKey ? null : current))
                  }
                  style={[styles.row, hovered === archiveKey && styles.hover]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${archiveIsOpen ? "Close" : "Open"} archive`}
                    accessibilityState={{ expanded: archiveIsOpen }}
                    disabled={rearranging}
                    style={styles.archivePress}
                    onPress={() => toggleArchive(group.id)}
                  >
                    <View style={styles.lead}>
                      <Icon
                        name={archiveIsOpen ? "ChevronDown" : "ChevronRight"}
                        size={14}
                        color={muted}
                      />
                    </View>
                    <Text style={styles.count}>{`Archive · ${archived}`}</Text>
                  </Pressable>
                </View>
              ) : null}
              {archived > 0 ? (
                <GroupBody key={`${group.id}:archive`} collapsed={!archiveIsOpen}>
                  {items.slice(1 + shown)}
                </GroupBody>
              ) : null}
            </GroupBody>,
          ];
        })}
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
        <StickyFooter surface={theme.colors.surface0}>
        <View style={styles.footer}>
          <View style={styles.addRow}>
            <HoverPressable
              accessibilityRole="button"
              style={feedback(styles.add)}
              onPress={() => setAdding(true)}
            >
              <Icon name="Plus" size={14} color={muted} />
              <Text style={styles.addText}>New group</Text>
            </HoverPressable>
          </View>
          <View style={styles.spacer} />
          {rearranging ? (
            <HoverPressable
              accessibilityRole="button"
              accessibilityLabel="Done rearranging"
              style={feedback(styles.done)}
              onPress={() => setRearranging(false)}
            >
              <Text style={styles.doneText}>Done</Text>
            </HoverPressable>
          ) : deleting ? (
            <>
              <HoverPressable
                accessibilityRole="button"
                accessibilityLabel="Delete the selected links"
                accessibilityState={{ disabled: selected.size === 0 }}
                disabled={busy || selected.size === 0}
                style={feedback([styles.action, styles.footerAction, selected.size ? null : styles.dim])}
                onPress={deleteSelected}
              >
                <Icon name="Check" size={16} color={selected.size ? strong : muted} />
              </HoverPressable>
              <HoverPressable
                accessibilityRole="button"
                accessibilityLabel="Stop deleting"
                style={feedback(styles.action)}
                onPress={stopDeleting}
              >
                <Icon name="X" size={16} color={muted} />
              </HoverPressable>
            </>
          ) : (
            <>
              <HoverPressable
                accessibilityRole="button"
                accessibilityLabel="Rearrange links"
                style={feedback([styles.action, styles.footerAction])}
                onPress={() => {
                  setDeleting(false);
                  setRearranging(true);
                }}
              >
                <Icon name="ArrowUpDown" size={14} color={muted} />
              </HoverPressable>
              <HoverPressable
                accessibilityRole="button"
                accessibilityLabel="Delete links"
                disabled={busy || !hasLinks}
                style={feedback(styles.action, false)}
                onPress={() => {
                  setRenaming(null);
                  setSelected(new Set());
                  setDeleting(true);
                }}
              >
                <Icon name="Trash2" size={14} color={hasLinks ? muted : muted} />
              </HoverPressable>
            </>
          )}
        </View>
        </StickyFooter>
        )}
      </View>
      {drop ? <View pointerEvents="none" style={[styles.drop, { top: drop.y - 1 }]} /> : null}
    </View>
  );
}
