import { exec } from "node:child_process";
import { readdir } from "node:fs/promises";

export class CloudflarePages {
  #project: string;
  #branch: string | undefined;
  #indexFilePath: string | undefined;

  get hostname(): string {
    if (!this.#branch) {
      throw new Error("Test results are not published yet.");
    }

    return `${this.#branch}.${this.#project}.pages.dev`;
  }
  get reportUrl() {
    if (!this.#indexFilePath) {
      throw new Error("Test results are not published yet.");
    }

    return `https://${this.hostname}/${this.#indexFilePath}`;
  }

  constructor(project: string) {
    if (!process.env.CLOUDFLARE_API_TOKEN) {
      throw new Error(
        "Set CLOUDFLARE_API_TOKEN environment variable to publish onto Cloudflare Pages. See: https://github.com/reg-viz/reg-suit/tree/master/packages/reg-publish-cloudflare-pages-plugin",
      );
    }

    this.#project = project;
  }

  /**
   * Create a Cloudflare Pages project
   * @returns
   */
  async createProject(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      exec(`npx wrangler pages project create ${this.#project}`, { cwd: __dirname }, (error, _, stderr) => {
        if (error) {
          return reject(error);
        }
        if (stderr) {
          return reject(stderr);
        }
        return resolve();
      });
    });
  }

  async publish(path: string, branch: string): Promise<void> {
    this.#branch = branch;
    this.#indexFilePath = (await readdir(path)).find(file => file.endsWith("index.html"));

    return new Promise<void>((resolve, reject) => {
      exec(
        `npx wrangler pages publish "${path}" --project-name="${this.#project}" --branch="${this.#branch}"`,
        { cwd: __dirname },
        (error, _, stderr) => {
          if (error) {
            return reject(error);
          }
          if (stderr) {
            return reject(stderr);
          }
          return resolve();
        },
      );
    });
  }
}
