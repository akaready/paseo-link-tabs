import type { PluginServerContext } from "@getpaseo/plugin/server";
import { linksOf } from "./server/links";
import { openLocalFile } from "./server/open";
import { previewUrlOf, stopPreviews } from "./server/preview";
import { titlesOf } from "./server/titles";
import { arrange } from "./shared/groups";
import { linkSettings, listLinks, openLink, previewLink } from "./shared/links";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(linkSettings);
  server.handle(listLinks, async ({ agentId }, { paseo }) => {
    const stored = await settings.read();
    const values = linkSettings.schema.parse(stored.status === "ready" ? stored.values : {});
    const links = await linksOf(paseo, agentId, values.cleared[agentId] ?? {});
    // Slow pages get a moment, then the list goes out without them and they are ready next time.
    const titles = await titlesOf(links.map((link) => link.url));
    const titled = links.map((link) => ({ ...link, title: titles.get(link.url) }));
    return { groups: arrange(titled, values), opener: values.opener };
  });
  server.handle(openLink, async ({ url }) => ({ opened: await openLocalFile(url) }));
  server.handle(previewLink, async ({ url }) => ({ url: await previewUrlOf(url) }));
  return () => stopPreviews();
}
