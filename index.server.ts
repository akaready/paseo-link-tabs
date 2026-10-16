import type { PluginServerContext } from "@getpaseo/plugin/server";
import { linksOf } from "./server/links";
import { arrange } from "./shared/groups";
import { linkSettings, listLinks } from "./shared/links";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(linkSettings);
  server.handle(listLinks, async ({ agentId }, { paseo }) => {
    const stored = await settings.read();
    const values = linkSettings.schema.parse(stored.status === "ready" ? stored.values : {});
    const links = await linksOf(paseo, agentId, values.cleared[agentId] ?? {});
    return { groups: arrange(links, values) };
  });
  return () => {};
}
