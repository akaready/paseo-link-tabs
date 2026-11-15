import {
  openExternalUrl,
  useRpc,
  type PluginAgentPanelProps,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { labelOfPath } from "../shared/groups";
import { openLink } from "../shared/links";
import { handoffFor, subscribeHandoffs } from "./handoff";

export const PREVIEW_PANEL = "preview";

const breakable = (url: string) => url.replace(/([/?&=#])/g, "$1​");

/**
 * The Link preview panel: the one place a link from the Links pill reaches Paseo's own browser.
 * The pill's popover cannot open a browser, a panel can, so the popover hands the link here. A
 * client without the browser (the web, the phones) hands it to the OS instead, the way a tap
 * used to, and says so.
 */
export function LinkPreviewPanel({ agentId, workspaceId, navigation, theme }: PluginAgentPanelProps) {
  const [handoff, setHandoff] = useState(() => handoffFor(agentId));
  const [failed, setFailed] = useState(false);
  const opened = useRef(-1);
  const openFile = useRpc(openLink);
  const browser = navigation?.openBrowser;

  useEffect(() => subscribeHandoffs(() => setHandoff(handoffFor(agentId))), [agentId]);

  /** Opens a link with Paseo's browser, or with the OS on a client that has none. */
  const show = useCallback(
    (url: string, file: string | undefined) => {
      setFailed(false);
      if (browser) {
        browser({ url, workspaceId });
        return;
      }
      if (file) {
        void openFile({ url: file }).then(
          ({ opened }) => setFailed(!opened),
          () => setFailed(true),
        );
        return;
      }
      void openExternalUrl(url).catch(() => setFailed(true));
    },
    [browser, workspaceId, openFile],
  );

  useEffect(() => {
    if (!handoff || opened.current === handoff.token) return;
    opened.current = handoff.token;
    show(handoff.url, handoff.file);
  }, [handoff, show]);

  const styles = useMemo(
    () => ({
      panel: { flex: 1, padding: 16, gap: 12, backgroundColor: theme.colors.surface0 },
      title: { color: theme.colors.foreground, fontSize: 15, fontWeight: "600" as const },
      link: { color: theme.colors.foregroundMuted, fontSize: 13, userSelect: "none" as const },
      note: { color: theme.colors.foregroundMuted, fontSize: 12 },
      actions: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
      button: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: 7,
        backgroundColor: theme.colors.surface2,
      },
      primary: { backgroundColor: theme.colors.accent },
      buttonText: { color: theme.colors.foreground, fontSize: 13, userSelect: "none" as const },
      primaryText: {
        color: theme.colors.accentForeground,
        fontSize: 13,
        fontWeight: "600" as const,
        userSelect: "none" as const,
      },
    }),
    [theme],
  );

  if (!handoff) {
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Link preview</Text>
        <Text style={styles.note}>Tap a link in the Links pill to open it here.</Text>
      </View>
    );
  }

  const name = handoff.file ? labelOfPath(handoff.file.replace(/^file:\/\//i, "")) : null;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{name ?? "Link preview"}</Text>
      <Text style={styles.link}>{breakable(handoff.file ?? handoff.url)}</Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open the link again"
          style={styles.button}
          onPress={() => show(handoff.url, handoff.file)}
        >
          <Icon name="RotateCw" size={14} color={theme.colors.foreground} />
          <Text style={styles.buttonText}>Open again</Text>
        </Pressable>
        {browser ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open the link in your browser"
            style={[styles.button, styles.primary]}
            onPress={() => {
              if (handoff.file) {
                void openFile({ url: handoff.file }).then(
                  ({ opened }) => setFailed(!opened),
                  () => setFailed(true),
                );
                return;
              }
              void openExternalUrl(handoff.url).catch(() => setFailed(true));
            }}
          >
            <Icon name="ExternalLink" size={14} color={theme.colors.accentForeground} />
            <Text style={styles.primaryText}>Open in your browser</Text>
          </Pressable>
        ) : null}
      </View>
      {failed ? (
        <Text style={styles.note}>Could not open that link.</Text>
      ) : (
        <Text style={styles.note}>
          {browser
            ? "Paseo's browser opens the page in this workspace, and keeps it there for every client."
            : "This client has no Paseo browser, so the page opened in your browser."}
        </Text>
      )}
    </View>
  );
}
