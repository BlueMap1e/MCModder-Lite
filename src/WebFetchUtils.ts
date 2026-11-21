import {
  GM_addValueChangeListener,
  GM_cookie,
  GM_getValue,
  GM_setValue,
  GM_xmlhttpRequest,
  type GmResponseEvent,
  type GmResponseType,
  type GmXmlhttpRequestOption,
} from "$";
import type { ConfigRepository } from "./config/ConfigRepository";
import { Utils } from "./Utils";
import { Values } from "./Values";

/**
 * 网络访问层：承载依赖配置与持久化状态的有状态请求逻辑。
 *
 * 限速排期（跨标签页游标）、批量请求日志与 `yxd_token` 重试原先挂在 `Utils` 实例上，
 * 现统一收敛到这里，由组合根持有为 `Mcmodder.web`。纯静态工具函数仍在 `Utils`，
 * 持久化状态见 `ConfigRepository`。所有网络请求必须经由 {@link createRequest} 派发，
 * 禁止在别处直接调用 `GM_xmlhttpRequest`。
 */
export class WebFetchUtils {
  /** @param configs 配置仓库，读取 `minimumRequestInterval` 等请求相关配置 */
  constructor(private readonly configs: ConfigRepository) {}

  /** 发包排期游标：独立 GM 键，避免每次请求都改写整份设置 */
  private requestCursor = 0;
  private requestCursorLoaded = false;

  /** 请求失败提示的去抖时间戳 */
  private lastRequestErrorAt = 0;

  /** 请求日志先攒在内存，2 秒或页面隐藏时再落盘，避免每个请求都读改写整份日志 */
  private pendingRequestLogs: string[] = [];
  private requestLogFlushTimer?: ReturnType<typeof setTimeout>;
  private requestLogFlushBound = false;

  /** 排队一条请求日志；达到阈值立即落盘，否则最多每 2 秒写一次 */
  private queueRequestLog(content: string) {
    this.pendingRequestLogs.push(content);
    if (!this.requestLogFlushBound) {
      this.requestLogFlushBound = true;
      window.addEventListener("pagehide", () => this.flushRequestLogs());
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") this.flushRequestLogs();
      });
    }
    if (this.pendingRequestLogs.length >= 32) {
      this.flushRequestLogs();
      return;
    }
    if (!this.requestLogFlushTimer) {
      this.requestLogFlushTimer = window.setTimeout(() => this.flushRequestLogs(), 2000);
    }
  }

  /** 把内存里的请求日志合并进持久化日志，并裁掉超出上限的旧记录 */
  private flushRequestLogs() {
    if (this.requestLogFlushTimer) {
      window.clearTimeout(this.requestLogFlushTimer);
      this.requestLogFlushTimer = undefined;
    }
    if (!this.pendingRequestLogs.length) return;
    const pending = this.pendingRequestLogs.splice(0);
    const logs = GM_getValue("mcmodderLogger")?.split(";").filter(Boolean) || [];
    logs.push(...pending);
    const max = Values.MAX_REQUEST_COUNT / 10;
    if (logs.length > max) logs.splice(0, logs.length - max);
    GM_setValue("mcmodderLogger", logs.join(";"));
  }

  /** 请求失败统一提示：多个并发请求同时失败时只提示一次，避免刷屏 */
  private notifyRequestError(reason: string) {
    const now = Date.now();
    if (now - this.lastRequestErrorAt < 5000) return;
    this.lastRequestErrorAt = now;
    Utils.commonMsg(`${reason}（详见控制台）`, false);
  }

  /**
   * 计算并记录本次请求的调度时间戳（按 `minimumRequestInterval` 限速；队列过长时返回 null）
   *
   * @returns 排定的发包时刻；返回 null 表示队列已超出上限，本次请求**不应**被发出，
   *   调用方必须据此放弃派发（见 {@link createRequest}）。
   */
  updateRequestTime() {
    const minimumRequestInterval = Math.max(
      this.configs.getSettings("minimumRequestInterval")!,
      500,
    );
    const now = Date.now();
    if (!this.requestCursorLoaded) {
      this.requestCursorLoaded = true;
      // 新键优先；旧版游标存在 settings 里，只读一次作为迁移回退
      const stored = Number(GM_getValue("mcmodderRequestCursor", 0)) || 0;
      const legacy = Number(this.configs.getSettings("lastRequestTime")) || 0;
      this.requestCursor = stored || legacy || now;
      // 跨标签页只同步这个小键，不再回灌整份设置
      GM_addValueChangeListener("mcmodderRequestCursor", (_key, _oldValue, value) => {
        const next = Number(value) || 0;
        if (next > this.requestCursor) this.requestCursor = next;
      });
    }
    let lastRequestTime = this.requestCursor || now;
    // 持久化的游标可能因旧版本数据、云端同步覆盖等而异常领先当前时间；此时照着它排期会把
    // 整条发包队列堵死，故直接丢弃、以当前时间重新起算
    if (lastRequestTime > now + minimumRequestInterval * Values.REQUEST_SCHEDULE_MAX_DRIFT_FACTOR) {
      console.warn("已排定时刻异常领先当前时间，发包排期将重新起算。");
      lastRequestTime = now;
    }
    if (lastRequestTime > now + minimumRequestInterval * Values.MAX_REQUEST_COUNT) {
      console.warn("已入队的请求数量超限，新的请求被忽略。");
      return null;
    }
    if (now > lastRequestTime) lastRequestTime = now;
    this.requestCursor = lastRequestTime + minimumRequestInterval;
    // 只写独立的游标键，避免每次请求都改写整份设置、覆盖其他标签页刚改的配置
    GM_setValue("mcmodderRequestCursor", this.requestCursor);
    return lastRequestTime;
  }

  /**
   * 发送限速请求的全局入口：
   * 按 `updateRequestTime` 排定延迟后发出，记录日志；遇到 `yxd_token` 校验响应时写入 cookie 并自动重发。
   *
   * 允许同时传入本次请求的用途说明（`message`），会随请求日志一并保存，便于排查请求目的。
   * 原则上所有网络请求都应当有附加信息，便于在监控中理解请求目的。
   *
   * @warning 队列超出 {@link Values.MAX_REQUEST_COUNT} 上限时，本请求直接以失败告终、**不会发包**
   *   （此前是把旧的队满哨兵值 `-1` 交给 `setTimeout`，负延迟被当作 0 处理，反而使限速彻底失效）。
   *   对本就无法降级重试的调用方而言失败与「不关心结果」无异；但计划任务与队列必须让失败
   *   可见地冒泡，否则会留下一条已排期、实则永远不会落地的待办。
   *
   * @param config 请求配置
   * @param message 本次请求的用途说明，会写入请求日志
   * @param silent 历史参数：旧版「网络请求监控」已移除，当前无实际效果；保留以兼容既有调用方
   * @param log 为 false 时不写请求日志；含认证 key 等敏感数据的内部请求应关闭
   */
  createRequest<R extends GmResponseType = "text">(
    config: GmXmlhttpRequestOption<R, unknown>,
    message?: string,
    silent = false,
    log = true,
    retry = false,
  ): Promise<GmResponseEvent<R, unknown>> {
    const lastRequestTime = this.updateRequestTime(),
      now = Date.now();
    if (lastRequestTime === null) {
      const errorMsg = "排队的请求已超出上限，本次请求被丢弃。";
      Utils.commonMsg(errorMsg + "（详见控制台）", false);
      return Promise.reject(new Error(errorMsg));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const succeed = (resp: GmResponseEvent<R, unknown>) => {
        if (settled) return;
        settled = true;
        resolve(resp);
      };
      const fail = (reason: string) => {
        if (settled) return;
        settled = true;
        console.warn(`[MCModder-Lite] 请求失败：${reason}`, config.url);
        this.notifyRequestError(reason);
        reject(new Error(reason));
      };
      setTimeout(() => {
        config.onload = (resp) => {
          if (settled) return;
          // 二进制响应（`responseType: "arraybuffer"` 等）下 responseText 未必是字符串，不能直接 trim
          const str = typeof resp.responseText === "string" ? resp.responseText.trim() : "";
          const yxdTokenList =
            str.startsWith("<script>") && str.endsWith("</script>")
              ? str.match(/'yxd_token=[0-9a-f]+'/)
              : null;
          if (!yxdTokenList) {
            // 普通响应，或形如 <script> 但并非 token 校验：交回调用方
            succeed(resp);
            return;
          }
          // 未授予 cookie 权限（部分管理器 / Firefox）时无法写入 token，直接交回原响应
          if (typeof GM_cookie === "undefined" || typeof GM_cookie.set !== "function") {
            succeed(resp);
            return;
          }
          const url = new URL(resp.finalUrl);
          const hostname = url.hostname;
          // 只允许百科域：避免把 token 写到第三方（CurseForge / Modrinth）域
          if (hostname !== "mcmod.cn" && !hostname.endsWith(".mcmod.cn")) {
            console.warn(`[MCModder-Lite] 忽略非百科域的 yxd_token：${hostname}`);
            succeed(resp);
            return;
          }
          if (retry) {
            // 已重试过一次仍是 token 响应：交回调用方，避免无限递归
            succeed(resp);
            return;
          }
          const pathname = url.pathname;
          const index = pathname.lastIndexOf("/");
          const path = index > 0 ? pathname.slice(0, index) : "/";
          const yxdToken = yxdTokenList[0].slice(11, -1);
          const resend = () =>
            this.createRequest(config, message, silent, log, true).then(succeed, (error: unknown) =>
              fail(error instanceof Error ? error.message : String(error)),
            );
          GM_cookie.set(
            {
              name: "yxd_token",
              value: yxdToken,
              domain: hostname,
              path: path || "/",
              secure: true,
              // token 由 <script> 挑战载荷下发、经客户端 document.cookie 落地——结构上
              // 不可能带 HttpOnly，非 HttpOnly 即站点原生形态。设 true 反而会使浏览器
              // 静默忽略站点自身的同名 document.cookie 刷新写入，故刻意保持 false
              //（2026-11-18 取证查结：站点 JS 与 Set-Cookie 均无此名，勿收紧）
              httpOnly: false,
            },
            (err) => {
              if (err) {
                console.warn("Failed to set `yxd_token!`", err);
                // 写入失败也要交回响应，避免调用方永久挂起
                succeed(resp);
                return;
              }
              // 回读校验：确认写入真的落地。部分管理器不实现 list，或策略不同导致
              // 读不到，此时只记录、不阻断重试——避免把用户永久卡在 token 响应页。
              const list = (
                GM_cookie as unknown as {
                  list?: (
                    details: { name?: string; domain?: string },
                    cb: (
                      cookies: Array<{ name: string; value: string }> | null,
                      err?: unknown,
                    ) => void,
                  ) => void;
                }
              ).list;
              if (typeof list !== "function") {
                void resend();
                return;
              }
              list.call(
                GM_cookie,
                { name: "yxd_token", domain: hostname },
                (cookies, listError) => {
                  const stored =
                    !listError &&
                    Array.isArray(cookies) &&
                    cookies.some((c) => c.name === "yxd_token" && c.value === yxdToken);
                  if (!stored) {
                    console.warn("[MCModder-Lite] yxd_token 写入后回读不一致，继续重试");
                  }
                  void resend();
                },
              );
            },
          );
        };
        config.onerror = () => fail("网络请求失败（请检查网络、代理或站点封禁）");
        config.ontimeout = () => fail("网络请求超时");
        config.onabort = () => fail("网络请求已取消");
        if (!config.timeout) config.timeout = 30000;
        if (log) {
          let content = `A${lastRequestTime}:${config.url}`;
          if (message) content += ` (${message})`;
          // 只记录请求体大小，绝不记录内容（可能含编辑正文 / 搜索词）
          if (config.data) {
            const bodySize = typeof config.data === "string" ? config.data.length : "non-string";
            content += ` [body:${bodySize}]`;
          }
          this.queueRequestLog(content);
        }
        GM_xmlhttpRequest(config);
      }, lastRequestTime - now);
    });
  }
}
