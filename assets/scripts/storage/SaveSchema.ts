/**
 * 存档结构定义与版本迁移（纯逻辑）。
 *
 * 版本历史：
 * - v1：早期原型格式（扁平的 best 表 + unlocked 数组 + sound 开关）。保留迁移以演示/保障兼容。
 * - v2：加入像素工坊作品与授权记录。
 * - v3：加入主题系列奖励（rewards）。
 * - v4：加入成长系统（经验/任务/周挑战/成就，progress）与广告频控（ads）。
 * 新增字段时：提升 SAVE_VERSION，在 migrate() 中补默认值，绝不直接丢弃旧数据。
 */

export const SAVE_VERSION = 6;

export interface LevelRecord {
    bestTimeMs: number;
    bestMoves: number;
    bestStars: number;
    completions: number;
    lastPlayedAt: number;
}

export interface DailyRecord {
    completed: boolean;
    bestTimeMs: number;
    bestMoves: number;
    stars: number;
    attempts: number;
    imageId: string;
}

export interface ChallengeLog {
    code: string;
    imageId: string;
    grid: number;
    /** 发起者成绩（来自分享数据，可能为空） */
    theirTimeMs: number;
    theirMoves: number;
    /** 我的成绩（未完成为 0） */
    myTimeMs: number;
    myMoves: number;
    at: number;
    /** 仅在 recent() 合并列表时标注 */
    kind?: 'sent' | 'received';
}

/** 像素工坊作品（照片转像素后的结果，只保存在本机） */
export interface CustomWork {
    id: string;
    name: string;
    createdAt: number;
    /** 调色板：0xRRGGBB */
    palette: number[];
    /** 60×60 个调色板索引，base64 编码 */
    pixels: string;
}

/** 主题系列奖励：集齐系列时自动发放一次，seen 表示庆祝页已展示/奖励已收下 */
export interface SeriesRewardRecord {
    at: number;
    seen: boolean;
}

/** 每日任务/周目标中的一项进度 */
export interface GoalState {
    id: string;
    progress: number;
    claimed: boolean;
}

/** 成长系统存档：全部本地，可由旧存档的成绩补算（见 ProgressManager.bootstrap） */
export interface ProgressState {
    /** 是否已用旧存档补算过经验与统计 */
    initialized: boolean;
    xp: number;
    stats: {
        puzzlesCompleted: number;
        threeStars: number;
        dailyChallenges: number;
        missionDays: number;
        weeklyCompleted: number;
        friendChallenges: number;
        friendWins: number;
    };
    missions: { dateKey: string; items: GoalState[]; bonusClaimed: boolean; counted: boolean };
    weekly: { weekKey: string; items: GoalState[]; completed: boolean; completeClaimed: boolean };
    weeklyHistory: Array<{ weekKey: string; theme: string; completedAt: number }>;
    achievements: Record<string, { at: number; claimed: boolean }>;
    /** 已发放过经验的事件键（防止重复刷经验），有上限，先进先出 */
    awarded: string[];
    /** 兑换所（v6 新增）。xp 是累计经验、只增不减（等级由它决定）；花掉的经验记在 shop.spent */
    shop: ShopState;
}

export interface ShopState {
    /** 已经花掉的经验；可兑换余额 = progress.xp − spent，永远不会让等级下降 */
    spent: number;
    /** 提示券库存 */
    hintTokens: number;
    /** 已拥有的棋盘配色 id（默认配色不用兑换） */
    owned: string[];
    /** 正在使用的棋盘配色 id */
    boardTheme: string;
    /** 已经发放过升级礼物的最高等级（每升一级送 1 张提示券，不会重复发） */
    giftLevel: number;
}

export function createDefaultShop(): ShopState {
    return { spent: 0, hintTokens: 0, owned: [], boardTheme: 'classic', giftLevel: 1 };
}

/** 广告频控（插屏只在自然转场出现） */
export interface AdState {
    dateKey: string;
    shownToday: number;
    lastShownAt: number;
    /** 自然转场的计数（用于“不是每局都弹”） */
    transitions: number;
}

/** 地狱模式成绩（每张作品一条；与普通模式的 records/星级完全分开） */
export interface HellRecord {
    bestTimeMs: number;
    bestMoves: number;
    /** 通关次数 */
    clears: number;
    firstClearAt: number;
    lastClearAt: number;
}

export interface Settings {
    music: boolean;
    sfx: boolean;
    vibration: boolean;
}

export interface SaveData {
    version: number;
    firstLaunchAt: number;
    lastLaunchAt: number;
    launchCount: number;
    /** 开始的总局数 */
    totalPlays: number;
    /** 完成的总局数 */
    totalCompletions: number;
    /** records[imageId][grid] */
    records: Record<string, Record<string, LevelRecord>>;
    /** 已收藏（已解锁）作品：imageId → 首次完成时间 */
    collected: Record<string, number>;
    /** daily[dateKey] */
    daily: Record<string, DailyRecord>;
    /** 地狱模式成绩：imageId → 记录（v5 新增） */
    hell: Record<string, HellRecord>;
    challenges: { sent: ChallengeLog[]; received: ChallengeLog[] };
    settings: Settings;
    tutorial: { puzzleBasics: boolean };
    player: { nickname: string; avatarId: number };
    /** 像素工坊作品（最多 MAX_CUSTOM 张） */
    custom: CustomWork[];
    /** 玩家已确认的授权说明（例如使用相册前的隐私提示） */
    consent: { photo: boolean };
    /** 系列奖励：seriesId → 记录。只增不减，保证不会重复发放 */
    rewards: Record<string, SeriesRewardRecord>;
    progress: ProgressState;
    ads: AdState;
}

export function createDefaultProgress(): ProgressState {
    return {
        initialized: false,
        xp: 0,
        stats: { puzzlesCompleted: 0, threeStars: 0, dailyChallenges: 0, missionDays: 0, weeklyCompleted: 0, friendChallenges: 0, friendWins: 0 },
        missions: { dateKey: '', items: [], bonusClaimed: false, counted: false },
        weekly: { weekKey: '', items: [], completed: false, completeClaimed: false },
        weeklyHistory: [],
        achievements: {},
        awarded: [],
        shop: createDefaultShop(),
    };
}

export function createDefaultSave(now: number): SaveData {
    return {
        version: SAVE_VERSION,
        firstLaunchAt: now,
        lastLaunchAt: now,
        launchCount: 0,
        totalPlays: 0,
        totalCompletions: 0,
        records: {},
        collected: {},
        daily: {},
        hell: {},
        challenges: { sent: [], received: [] },
        settings: { music: true, sfx: true, vibration: true },
        tutorial: { puzzleBasics: false },
        player: { nickname: '像素搭子', avatarId: 0 },
        custom: [],
        consent: { photo: false },
        rewards: {},
        progress: createDefaultProgress(),
        ads: { dateKey: '', shownToday: 0, lastShownAt: 0, transitions: 0 },
    };
}

/** v1 原型存档格式（只用于迁移） */
interface SaveDataV1 {
    version: 1;
    createdAt?: number;
    unlocked?: string[];
    best?: Record<string, { time: number; moves: number; stars: number }>;
    plays?: number;
    sound?: boolean;
    music?: boolean;
    tutorialDone?: boolean;
}

function isObj(v: unknown): v is Record<string, any> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

function num(v: unknown, d: number): number {
    return typeof v === 'number' && isFinite(v) ? v : d;
}

function bool(v: unknown, d: boolean): boolean {
    return typeof v === 'boolean' ? v : d;
}

function migrateV1(old: SaveDataV1, now: number): SaveData {
    const s = createDefaultSave(num(old.createdAt, now));
    for (const id of old.unlocked || []) if (typeof id === 'string') s.collected[id] = s.firstLaunchAt;
    if (isObj(old.best)) {
        for (const key of Object.keys(old.best)) {
            // v1 键名格式：imageId_grid
            const m = /^(.+)_(\d)$/.exec(key);
            const b = old.best[key];
            if (!m || !isObj(b)) continue;
            const [, imageId, grid] = m;
            if (!s.records[imageId]) s.records[imageId] = {};
            s.records[imageId][grid] = {
                bestTimeMs: num(b.time, 0) * 1000,
                bestMoves: num(b.moves, 0),
                bestStars: Math.min(3, Math.max(0, num(b.stars, 0))),
                completions: 1,
                lastPlayedAt: s.firstLaunchAt,
            };
            s.totalCompletions++;
        }
    }
    s.totalPlays = Math.max(num(old.plays, 0), s.totalCompletions);
    s.settings.sfx = bool(old.sound, true);
    s.settings.music = bool(old.music, true);
    s.tutorial.puzzleBasics = bool(old.tutorialDone, false);
    return s;
}

function goals(v: unknown): GoalState[] {
    if (!Array.isArray(v)) return [];
    return v.filter((g: any) => isObj(g) && typeof g.id === 'string').map((g: any) => ({ id: g.id, progress: num(g.progress, 0), claimed: bool(g.claimed, false) }));
}

/** 成长数据逐字段规范化：缺什么补什么，坏数据丢弃，绝不抛错 */
function normalizeProgress(p: any): ProgressState {
    const d = createDefaultProgress();
    d.initialized = bool(p.initialized, false);
    d.xp = Math.max(0, num(p.xp, 0));
    if (isObj(p.stats)) for (const k of Object.keys(d.stats) as Array<keyof ProgressState['stats']>) d.stats[k] = Math.max(0, num(p.stats[k], 0));
    if (isObj(p.missions)) d.missions = { dateKey: typeof p.missions.dateKey === 'string' ? p.missions.dateKey : '', items: goals(p.missions.items), bonusClaimed: bool(p.missions.bonusClaimed, false), counted: bool(p.missions.counted, false) };
    if (isObj(p.weekly)) d.weekly = { weekKey: typeof p.weekly.weekKey === 'string' ? p.weekly.weekKey : '', items: goals(p.weekly.items), completed: bool(p.weekly.completed, false), completeClaimed: bool(p.weekly.completeClaimed, false) };
    if (Array.isArray(p.weeklyHistory)) d.weeklyHistory = p.weeklyHistory.filter((h: any) => isObj(h) && typeof h.weekKey === 'string').map((h: any) => ({ weekKey: h.weekKey, theme: String(h.theme || ''), completedAt: num(h.completedAt, 0) })).slice(-26);
    if (isObj(p.achievements)) for (const k of Object.keys(p.achievements)) { const a = p.achievements[k]; if (isObj(a) && typeof a.at === 'number') d.achievements[k] = { at: a.at, claimed: bool(a.claimed, false) }; }
    if (Array.isArray(p.awarded)) d.awarded = p.awarded.filter((k: any) => typeof k === 'string').slice(-300);
    if (isObj(p.shop)) {
        const s = p.shop;
        d.shop = {
            spent: Math.max(0, Math.floor(num(s.spent, 0))),
            hintTokens: Math.max(0, Math.min(99, Math.floor(num(s.hintTokens, 0)))),
            owned: Array.isArray(s.owned) ? s.owned.filter((k: any) => typeof k === 'string').slice(0, 50) : [],
            boardTheme: typeof s.boardTheme === 'string' && s.boardTheme ? s.boardTheme : 'classic',
            giftLevel: Math.max(1, Math.floor(num(s.giftLevel, 1))),
        };
    }
    return d;
}

/**
 * 把任意来源的数据规范化为当前版本存档。
 * - 未知/损坏数据 → 返回 null，由调用方备份原文后重建。
 * - 缺失字段 → 补默认值。
 */
export function migrate(raw: unknown, now: number): SaveData | null {
    if (!isObj(raw)) return null;
    let data: any = raw;
    if (data.version === 1) data = migrateV1(data as SaveDataV1, now);
    // 所有旧版本（v1 已迁移、v2…）都按字段逐项补默认值，不丢任何已有进度
    if (typeof data.version !== 'number' || data.version < 1) return null;
    if (data.version > SAVE_VERSION) console.warn('[Save] 存档版本高于当前游戏版本，按兼容模式读取');
    const d = createDefaultSave(num(data.firstLaunchAt, now));
    d.lastLaunchAt = num(data.lastLaunchAt, now);
    d.launchCount = num(data.launchCount, 0);
    d.totalPlays = num(data.totalPlays, 0);
    d.totalCompletions = num(data.totalCompletions, 0);
    if (isObj(data.records)) d.records = data.records;
    if (isObj(data.collected)) d.collected = data.collected;
    if (isObj(data.daily)) d.daily = data.daily;
    if (isObj(data.hell)) {
        for (const k of Object.keys(data.hell)) {
            const r = data.hell[k];
            if (!isObj(r) || typeof r.bestTimeMs !== 'number' || typeof r.bestMoves !== 'number') continue;
            d.hell[k] = { bestTimeMs: r.bestTimeMs, bestMoves: r.bestMoves, clears: num(r.clears, 1), firstClearAt: num(r.firstClearAt, 0), lastClearAt: num(r.lastClearAt, 0) };
        }
    }
    if (isObj(data.challenges)) {
        d.challenges.sent = Array.isArray(data.challenges.sent) ? data.challenges.sent : [];
        d.challenges.received = Array.isArray(data.challenges.received) ? data.challenges.received : [];
    }
    if (isObj(data.settings)) {
        d.settings.music = bool(data.settings.music, true);
        d.settings.sfx = bool(data.settings.sfx, true);
        d.settings.vibration = bool(data.settings.vibration, true);
    }
    if (isObj(data.tutorial)) d.tutorial.puzzleBasics = bool(data.tutorial.puzzleBasics, false);
    if (Array.isArray(data.custom)) {
        d.custom = data.custom.filter(
            (w: any) => isObj(w) && typeof w.id === 'string' && Array.isArray(w.palette) && typeof w.pixels === 'string',
        );
    }
    if (isObj(data.consent)) d.consent.photo = bool(data.consent.photo, false);
    if (isObj(data.progress)) d.progress = normalizeProgress(data.progress);
    if (isObj(data.ads)) {
        d.ads = { dateKey: typeof data.ads.dateKey === 'string' ? data.ads.dateKey : '', shownToday: num(data.ads.shownToday, 0), lastShownAt: num(data.ads.lastShownAt, 0), transitions: num(data.ads.transitions, 0) };
    }
    if (isObj(data.rewards)) {
        for (const k of Object.keys(data.rewards)) {
            const r = data.rewards[k];
            if (isObj(r) && typeof r.at === 'number') d.rewards[k] = { at: r.at, seen: bool(r.seen, false) };
        }
    }
    if (isObj(data.player)) {
        if (typeof data.player.nickname === 'string' && data.player.nickname) d.player.nickname = data.player.nickname.slice(0, 12);
        d.player.avatarId = num(data.player.avatarId, 0);
    }
    return d;
}
