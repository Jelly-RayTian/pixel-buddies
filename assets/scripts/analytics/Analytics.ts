/** 统一事件名：新增事件必须先在这里登记，避免拼写不一致 */
export type AnalyticsEventName =
    | 'game_opened'
    | 'app_session_started'
    | 'first_game_started'
    | 'tutorial_started'
    | 'tutorial_completed'
    | 'puzzle_started'
    | 'puzzle_completed'
    | 'puzzle_replayed'
    | 'puzzle_abandoned'
    | 'daily_challenge_started'
    | 'daily_challenge_completed'
    | 'hint_used'
    | 'hint_token_used'
    | 'shop_purchase'
    | 'daily_mission_completed'
    | 'weekly_challenge_completed'
    | 'achievement_unlocked'
    | 'level_up'
    | 'collection_item_unlocked'
    | 'collection_series_progressed'
    | 'collection_series_completed'
    | 'collection_reward_claimed'
    | 'collection_page_opened'
    | 'friend_challenge_created'
    | 'friend_challenge_completed'
    | 'share_clicked'
    | 'rewarded_ad_started'
    | 'rewarded_ad_completed'
    | 'interstitial_ad_shown'
    | 'loading_time'
    | 'asset_load_failed'
    | 'game_error';

/** 允许上报到平台后台的事件（其余只留在本地缓冲）。平台后台需要同名事件才会入库 */
export const REMOTE_EVENTS: ReadonlySet<AnalyticsEventName> = new Set<AnalyticsEventName>([
    // 获客
    'game_opened',
    'first_game_started',
    'tutorial_completed',
    // 玩法
    'puzzle_started',
    'puzzle_completed',
    'puzzle_abandoned',
    'puzzle_replayed',
    // 留存
    'daily_challenge_started',
    'daily_challenge_completed',
    'weekly_challenge_completed',
    'app_session_started',
    // 互动
    'collection_item_unlocked',
    'collection_series_completed',
    'achievement_unlocked',
    'level_up',
    'friend_challenge_created',
    'friend_challenge_completed',
    // 性能
    'loading_time',
    'asset_load_failed',
    'game_error',
    // 其他（平台后台自定义事件沿用）
    'tutorial_started',
    'daily_mission_completed',
    'share_clicked',
    'rewarded_ad_started',
    'rewarded_ad_completed',
    'interstitial_ad_shown',
]);

export type AnalyticsProps = Record<string, string | number | boolean>;

export interface AnalyticsEvent {
    name: AnalyticsEventName;
    at: number;
    props?: AnalyticsProps;
}

/** 远程上报通道：平台官方统计（wx.reportEvent / tt.reportAnalytics）或自有服务器 */
export interface AnalyticsSink {
    send(e: AnalyticsEvent): void;
}

/** 对外名称：AnalyticsAdapter（与平台适配器命名一致） */
export type AnalyticsAdapter = AnalyticsSink;

/** 这些属性名一律丢弃：不上报任何可识别个人的字段 */
const PII_KEYS = /(nick|avatar|openid|unionid|phone|mail|photo|token|^name$|_name$|Name$|url$|path$|^ip$|uid$)/i;
const MAX_STRING = 48;

/** 字符串值里的网址、邮箱、疑似文件路径一律抹掉（错误信息里可能带出） */
export function scrub(v: string): string {
    const t = v
        .replace(/https?:\/\/\S+/gi, '[url]')
        .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[mail]')
        .replace(/(?:[A-Za-z]:)?[\\/](?:[\w.-]+[\\/])+[\w.-]*/g, '[path]');
    return t.length > MAX_STRING ? t.slice(0, MAX_STRING) : t;
}

/** 清洗属性：只保留短字符串/数字/布尔，丢弃疑似个人信息的键（item、series 等玩法标识不受影响） */
export function sanitizeProps(props?: AnalyticsProps): AnalyticsProps | undefined {
    if (!props) return undefined;
    const out: AnalyticsProps = {};
    for (const k of Object.keys(props)) {
        if (PII_KEYS.test(k)) continue;
        const v = props[k];
        if (typeof v === 'string') out[k] = scrub(v);
        else if (typeof v === 'number') out[k] = Number.isFinite(v) ? v : 0;
        else if (typeof v === 'boolean') out[k] = v;
    }
    return out;
}

/**
 * 数据分析：本地环形缓冲 + 可选远程通道。
 * - 默认只在本地缓冲；只有 remoteEnabled()（玩家同意匿名统计，见 Privacy.ts）为真时才会交给远程通道；
 * - 只记录玩法事件，不含昵称/头像/openid/照片等个人信息（sanitizeProps 兜底）；
 * - trackOnce 对同一会话内的重复事件去重（如 app_opened、tutorial_started）；
 * - 调试模式把事件打印到控制台。
 */
export class Analytics {
    private buffer: AnalyticsEvent[] = [];
    private sinks: AnalyticsSink[] = [];
    private debug = false;
    private onceKeys = new Set<string>();

    constructor(private readonly remoteEnabled: () => boolean = () => false, private readonly clock: () => number = () => Date.now()) {}

    /** 调试环境下把事件打印到控制台（不上传） */
    setDebug(on: boolean): void {
        this.debug = on;
    }

    /** 兼容旧接口：替换为单一通道（null 清空） */
    setSink(sink: AnalyticsSink | null): void {
        this.sinks = sink ? [sink] : [];
    }

    addSink(sink: AnalyticsSink): void {
        this.sinks.push(sink);
    }

    track(name: AnalyticsEventName, props?: AnalyticsProps): void {
        const e: AnalyticsEvent = { name, at: this.clock(), props: sanitizeProps(props) };
        if (this.debug) console.log(`[Analytics] ${name}`, e.props ? JSON.stringify(e.props) : '');
        this.buffer.push(e);
        if (this.buffer.length > 200) this.buffer.shift();
        if (!this.remoteEnabled() || !REMOTE_EVENTS.has(name)) return;
        for (const s of this.sinks) {
            try {
                s.send(e);
            } catch {
                /* 上报失败不影响游戏 */
            }
        }
    }

    /** 同一会话内相同 key 只记录一次；返回是否真正记录 */
    trackOnce(key: string, name: AnalyticsEventName, props?: AnalyticsProps): boolean {
        if (this.onceKeys.has(key)) return false;
        this.onceKeys.add(key);
        this.track(name, props);
        return true;
    }

    /** 新会话开始：清掉“本会话只记一次”的标记 */
    resetOnce(): void {
        this.onceKeys.clear();
    }

    recent(n = 20): AnalyticsEvent[] {
        return this.buffer.slice(-n);
    }

    count(name: AnalyticsEventName): number {
        return this.buffer.reduce((n, e) => n + (e.name === name ? 1 : 0), 0);
    }
}
