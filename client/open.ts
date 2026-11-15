import { openExternalUrl } from "@getpaseo/plugin/client";

/** Opens a local file through the daemon, which owns the machine the file is on. */
export type OpenFile = (input: { url: string }) => Promise<{ opened: boolean }>;

/**
 * Opens a link the list shows. A page on the web goes through Paseo's own opener; a file on this
 * machine goes to the daemon, which hands it to the OS. Answers whether it opened.
 */
export async function openSharedLink(openFile: OpenFile, url: string) {
  try {
    if (/^file:\/\//i.test(url)) return (await openFile({ url })).opened;
    await openExternalUrl(url);
    return true;
  } catch {
    return false;
  }
}
