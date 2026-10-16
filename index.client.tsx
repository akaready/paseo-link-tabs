import type { PluginClientContext } from "@getpaseo/plugin/client";
import { followAgents } from "./client/bar";

export default function contribute(client: PluginClientContext) {
  return followAgents(client);
}
