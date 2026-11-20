import type { ConfigRepository } from "../config/ConfigRepository";
import type { Mcmodder } from "../Mcmodder";

/**
 * 页面功能基类：`canRun()` 是 URL/DOM 门控（在 InitLoader 里决定是否实例化并执行），
 * `run()` 承载全部 DOM 改动。
 *
 * 契约：`canRun()` 返回 false **不等于**文件死代码——部分子类被其他 Init 或
 * `Mcmodder.editorLoad` 直接实例化后调用 `run()`，绕过门控（ItemTabInit /
 * GeneralEditInit / EditorInit / VerifyPageInit 均属此类，各自文件内有说明）。
 * `run()` 可能被同一页面多次调用（SPA 分发场景），必须保证幂等或自带重入门控。
 */
export abstract class Init {
  parent: Mcmodder;
  configs: ConfigRepository;
  constructor(parent: Mcmodder) {
    this.parent = parent;
    this.configs = parent.configRepository;
  }
  abstract canRun(): boolean;
  abstract run(): void;
}
