import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { linkSettings, type Opener } from "../shared/links";

/**
 * Link Tabs' settings, in Paseo's own plugin settings area: where a tap opens a link, on every
 * chat of this host. The Links list itself stays a list.
 */
export function LinkSettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(linkSettings);
  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: { padding: 16, gap: 12 },
      note: { color: theme.colors.foregroundMuted, fontSize: 13 },
    }),
    [theme],
  );

  if (settings.status === "loading") {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <Text style={styles.note}>Reading settings…</Text>
        </View>
      </View>
    );
  }
  if (settings.status !== "ready") {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <Text style={styles.note}>Could not read this plugin's settings.</Text>
        </View>
      </View>
    );
  }

  const values = settings.values;
  const save = (change: Partial<typeof values>) =>
    void settings.save({ ...values, ...change }, settings.revision);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsSelect<Opener>
          label="A click opens in"
          hint="Your browser needs nothing extra. Paseo's browser can only be opened by a panel, so choosing it adds a Link preview tab to the workspace; it is in the desktop app only, and holding ⌘ (Ctrl elsewhere) when clicking opens the other way either way."
          value={values.opener}
          options={[
            { label: "Paseo's browser", value: "paseo" },
            { label: "Your browser", value: "system" },
          ]}
          onValueChange={(next) => save({ opener: next })}
          disabled={settings.saving}
        />
        {settings.saveError ? <Text style={styles.note}>{settings.saveError}</Text> : null}
      </ScrollView>
    </View>
  );
}
