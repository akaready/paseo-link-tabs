import type { PluginClientContext } from "@getpaseo/plugin/client";
import { followAgents } from "./client/bar";
import { LinkSettings } from "./client/settings";

export default function contribute(client: PluginClientContext) {
  // In Paseo's own plugin settings area, not in the list: the list is for links.
  const removeSettings = client.addSettingsScreen({
    id: "settings",
    title: "Settings",
    icon: "Link",
    Component: LinkSettings,
  });
  const removeLinks = followAgents(client);
  return () => {
    removeSettings();
    removeLinks();
  };
}
