import { PublisherPlugin, PluginCreateOptions, WorkingDirectoryInfo } from "reg-suit-interface";
import { FileItem, ObjectListResult, AbstractPublisher } from "reg-suit-util";

import { CloudflarePages } from "./cloudflare-pages";

export interface PluginConfig {
  project: string;
}

export class CloudflarePagesPublisherPlugin extends AbstractPublisher implements PublisherPlugin<PluginConfig> {
  name = "reg-publish-cloudflare-pages-plugin";

  #options: PluginCreateOptions<any> | undefined;
  #pluginConfig: PluginConfig | undefined;
  #cloudflarePages: CloudflarePages | undefined;

  constructor() {
    super();
  }

  init(config: PluginCreateOptions<PluginConfig>) {
    this.noEmit = config.noEmit;
    this.logger = config.logger;
    this.#options = config;
    this.#pluginConfig = {
      ...config.options,
    };
  }

  async publish(key: string) {
    if (!this.#pluginConfig) {
      throw new Error("Class not initialized yet.");
    }

    this.#cloudflarePages = new CloudflarePages(this.#pluginConfig.project);
    this.#cloudflarePages.publish(this.getWorkingDirs().base, key);
    return { reportUrl: this.#cloudflarePages.reportUrl };
  }

  protected getBucketName(): string {
    if (!this.#cloudflarePages) {
      throw new Error("Class not initialized yet.");
    }
    return this.#cloudflarePages.hostname;
  }

  protected getWorkingDirs(): WorkingDirectoryInfo {
    if (!this.#options) {
      throw new Error("Class not initialized yet.");
    }
    return this.#options.workingDirs;
  }

  async fetch(): Promise<any> {
    throw new Error("Cloudflare Pages does not support fetching data from the server.");
  }
  protected getBucketRootDir(): string | undefined {
    throw new Error("Method not implemented. This method should not be called.");
  }
  protected getLocalGlobPattern(): string | undefined {
    throw new Error("Method not implemented. This method should not be called.");
  }
  protected async uploadItem(): Promise<FileItem> {
    throw new Error("Method not implemented. This method should not be called.");
  }
  protected async downloadItem(): Promise<FileItem> {
    throw new Error("Method not implemented. This method should not be called.");
  }
  protected async listItems(): Promise<ObjectListResult> {
    throw new Error("Method not implemented. This method should not be called.");
  }
}
