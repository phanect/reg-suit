import * as resolve from "resolve";
import * as fs from "fs";
import * as path from "path";
import configManager, { ConfigManager } from "./config-manager";
import logger, { RegLogger } from "./logger";
import {
  KeyGenerator,
  KeyGeneratorPlugin,
  Notifier,
  NotifierPlugin,
  Plugin,
  PluginCreateOptions,
  PluginPreparer,
  PublishResult,
  Publisher,
  PublisherPlugin,
  NotifyParams,
  KeyGeneratorPluginFactory,
  PublisherPluginFactory,
  NotifierPluginFactory,
  KeyGeneratorPluginHolder,
  PublisherPluginHolder,
  NotifierPluginHolder,
  CoreConfig,
  CreateQuestionsOptions,
  RegSuitConfiguration,
  ComparisonResult,
} from "reg-suit-interface";

const compare = require("reg-cli");

export interface PluginMetadata {
  moduleId: string;
  [key: string]: any;
}

function isPublisher(pluginHolder: PluginMetadata): pluginHolder is (PublisherPluginHolder<any, any> & PluginMetadata) {
  return !!pluginHolder["publisher"];
}

function isKeyGenerator(pluginHolder: PluginMetadata): pluginHolder is (KeyGeneratorPluginHolder<any, any> & PluginMetadata) {
  return !!pluginHolder["keyGenerator"];
}

function isNotifier(pluginHolder: PluginMetadata): pluginHolder is (NotifierPluginHolder<any, any> & PluginMetadata) {
  return !!pluginHolder["notifier"];
}

export interface StepResultAfterExpectedKey {
  expectedKey: string | null;
}

export interface StepResultAfterComparison extends StepResultAfterExpectedKey {
  comparisonResult: ComparisonResult;
}

export interface StepResultAfterActualKey extends StepResultAfterComparison {
  actualKey: string ;
}

export interface StepResultAfterPublish extends StepResultAfterActualKey {
  reportUrl: string | null;
}

export class RegSuitCore {

  _keyGenerator?: KeyGeneratorPlugin<any>;
  _publisher?: PublisherPlugin<any>;
  _notifiers: NotifierPlugin<any>[] = [];

  noEmit: boolean;
  logger: RegLogger;
  _config: RegSuitConfiguration;
  _configManager: ConfigManager;
  _pluginHolders: PluginMetadata[] = [];

  constructor(opt?: {
    logLevel?: "info" | "silent" | "verbose";
    noEmit?: boolean;
  }) {
    this.logger = logger;
    this._configManager = configManager;
    if (opt && opt.logLevel) {
      this.logger.setLevel(opt.logLevel);
    }
    this.noEmit = !!(opt && opt.noEmit);
  }

  _loadPlugins() {
    if (!this._config.plugins) return;
    const pluginNames = Object.keys(this._config.plugins);
    pluginNames.forEach(pluginName => {
      this._loadPlugin(pluginName);
    });
  }

  _loadPlugin(name: string) {
    let pluginFileName = null;
    try {
      pluginFileName = resolve.sync(name, { basedir: process.cwd() });
    } catch (e) {
      // TODO
      this.logger.error(e);
    }
    if (pluginFileName) {
      const factory = require(pluginFileName);
      const pluginHolder = factory();
      this._pluginHolders.push({ ...pluginHolder, moduleId: name });
    }
  }

  createQuestions(opt: CreateQuestionsOptions) {
    const config = this._loadConfig(opt.configFileName);
    const noConfigurablePlugins: string[] = [];
    const preparerHolders : { name: string; preparer: PluginPreparer<any, any> }[] = [];
    opt.pluginNames.forEach(name => this._loadPlugin(name));
    this._pluginHolders.forEach(h => {
      if (h["preparer"]) {
        preparerHolders.push({ name: h.moduleId, preparer: h["preparer"] });
      } else {
        noConfigurablePlugins.push(h.moduleId);
      }
    });
    return [
      ...noConfigurablePlugins.map(pluginName => {
        return {
          name: pluginName,
          questions: [] as any[],
          prepare: (inquireResult: any) => Promise.resolve<any>(true),
          configured: null,
        };
      }),
      ...preparerHolders.map(holder => {
        const questions = holder.preparer.inquire();
        const boundPrepare = (inquireResult: any) => holder.preparer.prepare({
          coreConfig: config.core,
          logger: this.logger,
          options: inquireResult,
          noEmit: this.noEmit,
        });
        const configured = (config.plugins && typeof config.plugins[holder.name] === "object") ? config.plugins[holder.name] : null;
        return {
          name: holder.name,
          // FIXME
          // TS4053 Return type of public method from exported class has or is using name 'inquirer.Question' from external module "reg-suit-core/node_modules/@types/inquirer/index" but cannot be named.
          questions: questions as any[],
          prepare: boundPrepare,
          configured,
        };
      }),
    ];
  }

  persistMergedConfig(opt: { core?: CoreConfig; pluginConfigs: { name: string; config: any }[] }, confirm: (newConfig: RegSuitConfiguration) => Promise<boolean>) {
    const baseConfig = this._loadConfig();
    const mergedConfig = {
      core: opt.core ? { ...baseConfig.core, ...opt.core } : baseConfig.core,
      plugins: { ...baseConfig.plugins },
    };
    opt.pluginConfigs.forEach(pc => {
      mergedConfig.plugins[pc.name] = baseConfig.plugins ? {
        ...baseConfig.plugins[pc.name],
        ...pc.config,
      } : pc.config;
    });
    this.logger.verbose("Merged configuration: ");
    this.logger.verbose(JSON.stringify(mergedConfig, null, 2));
    if (JSON.stringify(baseConfig) === JSON.stringify(mergedConfig)) {
      // If there is no difference, exit quietly.
      return Promise.resolve();
    }
    if (this.noEmit) return Promise.resolve();
    return confirm(mergedConfig).then(result => {
      if (result) this._configManager.writeConfig(mergedConfig);
    });
  }

  init(configFileName?: string) {
    this._loadConfig(configFileName);
    this._loadPlugins();
    this._initKeyGenerator();
    this._initPublisher();
    this._initNotifiers();
  }

  _initKeyGenerator() {
    const metadata = this._pluginHolders.filter(holder => isKeyGenerator(holder));
    if (metadata.length > 1) {
      const pluginNames = metadata.map(p => p.moduleId).join(", ");
      this.logger.warn(`2 or more key generator plugins are found. Select one of ${pluginNames}.`);
    } else if (metadata.length === 1 && this._config.plugins) {
      const ph = metadata[0];
      const pluginSpecifiedOption = this._config.plugins[ph.moduleId];
      if (isKeyGenerator(ph) && pluginSpecifiedOption) {
        this._keyGenerator = ph.keyGenerator;
        this._keyGenerator.init({
          coreConfig: this._config.core,
          logger: this.logger,
          options: pluginSpecifiedOption,
          noEmit: this.noEmit,
        });
        this.logger.verbose(`${ph.moduleId} is inialized with: `);
        this.logger.verbose(`${JSON.stringify(pluginSpecifiedOption, null, 2)}`);
      }
    } else {
      this.logger.verbose("No key generator.");
    }
  }

  _initPublisher() {
    const metadata = this._pluginHolders.filter(holder => isPublisher(holder));
    if (metadata.length > 1) {
      const pluginNames = metadata.map(p => p.moduleId).join(", ");
      this.logger.warn(`2 or more publisher plugins are found. Select one of ${pluginNames}.`);
    } else if (metadata.length === 1 && this._config.plugins) {
      const ph = metadata[0];
      const pluginSpecifiedOption = this._config.plugins[ph.moduleId];
      if (isPublisher(ph) && pluginSpecifiedOption) {
        this._publisher = ph.publisher;
        this._publisher.init({
          coreConfig: this._config.core,
          logger: this.logger,
          options: pluginSpecifiedOption,
          noEmit: this.noEmit,
        });
        this.logger.verbose(`${ph.moduleId} is inialized with: `);
        this.logger.verbose(`${JSON.stringify(pluginSpecifiedOption, null, 2)}`);
      }
    } else {
      this.logger.verbose("No publisher.");
    }
  }

  _initNotifiers() {
    const metadata = this._pluginHolders.filter(holder => isNotifier(holder));
    this._notifiers = [];
    metadata.forEach(ph => {
      if (!this._config.plugins) return;
      const pluginSpecifiedOption = this._config.plugins[ph.moduleId];
      if (isNotifier(ph) && pluginSpecifiedOption) {
        const notifier = ph.notifier;
        notifier.init({
          coreConfig: this._config.core,
          logger: this.logger,
          options: pluginSpecifiedOption,
          noEmit: this.noEmit,
        });
        this._notifiers.push(ph.notifier);
        this.logger.verbose(`${ph.moduleId} is inialized with: `);
        this.logger.verbose(`${JSON.stringify(pluginSpecifiedOption, null, 2)}`);
      }
    });
  }

  _loadConfig(configFileName?: string) {
    if (!this._config) {
      if (configFileName) {
        this.logger.verbose(`config file: ${configFileName}`);
      } else {
        this.logger.verbose(`config file not specified, load from ${configManager.defaultConfigFileName}.`);
      }
      this._config = this._configManager.readConfig(configFileName).config;
    }
    return this._config;
  }

  getDirectoryInfo(configFileName?: string) {
    this._loadConfig(configFileName);
    const actualDir = path.join(path.resolve(process.cwd(), this._config.core.workingDir), this._config.core.actualDir);
    const expectedDir = path.join(path.resolve(process.cwd(), this._config.core.workingDir), this._config.core.expectedDir);
    return {
      actualDir,
      expectedDir,
    };
  }

  runAll() {
    return this.getExpectedKey()
    .then(ctx => this.fetch(ctx))
    .then(ctx => this.compare(ctx))
    .then(ctx => this.getActualKey(ctx))
    .then(ctx => this.publish(ctx))
    .then(ctx => this.notify(ctx))
    ;
  }

  getExpectedKey(): Promise<StepResultAfterExpectedKey> {
    if (this._keyGenerator) {
      return this._keyGenerator.getExpectedKey()
        .then(key => {
          this.logger.info(`Detected the previous snapshot key: '${key}'`);
          return { expectedKey: key };
        })
        .catch(reason => {
          this.logger.warn("Failed to detect the previous snapshot key");
          this.logger.error(reason);
          return Promise.resolve({ expectedKey: null });
        })
      ;
    } else {
      this.logger.info("Skipped to detect the previous snapshot key because key generator plugin is not set up.");
      return Promise.resolve({ expectedKey: null });
    }
  }

  compare(ctx: StepResultAfterExpectedKey): Promise<StepResultAfterComparison> {
    return (compare({
      actualDir: path.join(this._config.core.workingDir, this._config.core.actualDir),
      expectedDir: path.join(this._config.core.workingDir, this._config.core.expectedDir),
      diffDir: path.join(this._config.core.workingDir, "diff"),
      json: path.join(this._config.core.workingDir, "out.json"),
      report: path.join(this._config.core.workingDir, "index.html"),
      update: false,
      ignoreChange: true,
      urlPrefix: "",
      threshold: .5,
    }) as Promise<ComparisonResult>)
    .then(result => {
      this.logger.verbose("Comparison result:");
      this.logger.verbose(JSON.stringify(result, null, 2));
      return { ...ctx, comparisonResult: result };
    })
    .catch(reason => {
      this.logger.error(reason);
      return Promise.reject<StepResultAfterComparison>(reason);
    });
  }

  getActualKey(ctx: StepResultAfterComparison): Promise<StepResultAfterActualKey> {
    const fallbackFn = () => "snapshot_" + ~~(new Date().getTime() / 1000);
    if (this._keyGenerator) {
      return this._keyGenerator.getActualKey().then(key => {
        if (!key) {
          this.logger.warn("Failed to generate the current snapshot key.");
          return { ...ctx, actualKey: fallbackFn() };
        }
        this.logger.info(`The current snapshot key: '${key}'`);
        return { ...ctx, actualKey: key };
      }).catch(reason => {
        this.logger.warn("Failed to gerenate the current snapshot key.");
        this.logger.error(reason);
        return Promise.resolve({ ...ctx, actualKey: fallbackFn() });
      });
    } else {
      const fallbackKey = fallbackFn();
      this.logger.info(`Use '${fallbackKey}' as the current snapshot key because key generator plugin is not set up.`);
      return Promise.resolve({ ...ctx, actualKey: fallbackKey });
    }
  }

  fetch(ctx: StepResultAfterExpectedKey): Promise<StepResultAfterExpectedKey> {
    const keyForExpected = ctx.expectedKey;
    if (this._publisher && keyForExpected) {
      return this._publisher.fetch(keyForExpected);
    } else if (!keyForExpected) {
      this.logger.info("Skipped to fetch the expeceted data because expected key is null.");
      return Promise.resolve(ctx);
    } else if (!this._publisher) {
      this.logger.info("Skipped to fetch the expeceted data because publisher plugin is not set up.");
      return Promise.resolve(ctx);
    } else {
      return Promise.resolve(ctx);
    }
  }

  publish(ctx: StepResultAfterActualKey): Promise<StepResultAfterPublish> {
    if (this._publisher) {
      return this._publisher.publish(ctx.actualKey)
        .then(result => {
          this.logger.info(`Published snapshot '${ctx.actualKey}' successfully.`);
          if (result.reportUrl) {
            this.logger.info(`Report URL: ${result.reportUrl}`);
          }
          this.logger.verbose("Publish result:");
          this.logger.verbose(JSON.stringify(result, null, 2));
          return { ...ctx, reportUrl: result.reportUrl };
        })
        .catch(reason => {
          this.logger.error("An error occurs when publishing snapshot:");
          this.logger.error(reason);
          return Promise.reject<StepResultAfterPublish>(reason);
        })
      ;
    } else {
      this.logger.info("Skipped to publish the snapshot data because publisher plugin is not set up.");
      return Promise.resolve(ctx);
    }
  }

  notify(ctx: StepResultAfterPublish): Promise<StepResultAfterPublish> {
    const notifyParams: NotifyParams = {
      ...ctx,
    };
    if (!this._notifiers.length) {
      this.logger.info("Skipped to notify result because notifier plugins are not set up.");
    }
    this.logger.verbose("Notify paramerters:");
    this.logger.verbose(JSON.stringify(notifyParams, null, 2));
    return Promise.all(this._notifiers.map((notifier) => notifier.notify(notifyParams))).then(() => ctx);
  }
}
