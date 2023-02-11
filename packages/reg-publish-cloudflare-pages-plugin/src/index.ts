import { PublisherPluginFactory } from "reg-suit-interface";
import { CloudflarePagesPublisherPlugin } from "./cloudflare-pages-publisher-plugin";
import { CloudflarePagesPreparer } from "./cloudflare-pages-preparer";

const pluginFactory: PublisherPluginFactory = () => {
  return {
    preparer: new CloudflarePagesPreparer(),
    publisher: new CloudflarePagesPublisherPlugin(),
  };
};

export = pluginFactory;
