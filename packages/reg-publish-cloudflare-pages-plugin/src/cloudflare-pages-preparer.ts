import { v4 as uuid } from "uuid";
import { PluginPreparer, PluginCreateOptions, PluginLogger } from "reg-suit-interface";
import { PluginConfig } from "./cloudflare-pages-publisher-plugin";
import { CloudflarePages } from "./cloudflare-pages";

export interface SetupInquireResult {
  createProject: boolean;
  project?: string;
}

const PROJECT_PREFIX = "reg-publish-project";

export class CloudflarePagesPreparer implements PluginPreparer<SetupInquireResult, PluginConfig> {
  #logger!: PluginLogger;

  inquire() {
    return [
      {
        name: "createProject",
        type: "confirm",
        message: "Create a new Cloudflare Pages project",
        default: true,
      },
      {
        name: "project",
        type: "input",
        message: "Existing Cloudflare Pages project name",
        when: (ctx: any) => !(ctx as { createProject: boolean }).createProject,
      },
    ];
  }

  async prepare(config: PluginCreateOptions<SetupInquireResult>): Promise<{ project: string }> {
    this.#logger = config.logger;
    const ir = config.options;
    if (!ir.createProject) {
      return { project: ir.project as string };
    } else {
      const id = uuid();
      const project = `${PROJECT_PREFIX}-${id}`;

      const cloudflarePages = new CloudflarePages(project);

      if (config.noEmit) {
        this.#logger.info(`Skip to create Cloudflare Pages project ${project} because of noEmit option.`);
        return { project };
      }

      this.#logger.info(`Create new Cloudflare Pages project: ${this.#logger.colors.magenta(project)}`);
      const spinner = this.#logger.getSpinner(`creating project...`);
      spinner.start();
      await cloudflarePages.createProject();
      spinner.stop();

      return { project };
    }
  }
}
