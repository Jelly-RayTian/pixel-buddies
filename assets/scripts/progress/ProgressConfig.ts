import { ART_LIST } from '../art/ArtCatalog';
import { SERIES_LIST, SeriesInfo } from '../collection/SeriesCatalog';
import { hashString, SeededRandom } from '../core/Random';
import { shiftDateKey } from '../daily/DailyChallengeManager';

/**
 * 成长系统配置（纯数据 + 纯函数，不依赖 cc）。
 * 所有数值集中在这里，方便调平衡；只有经验一种进度货币，奖励都是经验、称号和成就。
 */

// ---------------------------------------------------------------- 经验与等级

/** 首次完成某作品的某难度获得的基础经验（同一作品同难度只发一次） */
export const GRID_XP: Record<number, number> = { 3: 10, 4: 20, 5: 35, 6: 50 };
/** 星级提升（第一次到 2 星、3 星）每多一星的额外经验 */
export const STAR_XP = 8;
export const DAILY_CHALLENGE_XP = 30;
export const FRIEND_CHALLENGE_XP = 20;
export const FRIEND_WIN_XP = 20;
export const MISSION_BONUS_XP = 40;
export const WEEKLY_COMPLETE_XP = 120;

/** 到达某一级所需的累计经验：Lv1=0, Lv2=40, Lv3=120, Lv4=240 ... */
export function xpForLevel(level: number): number {
    return (40 * (level - 1) * level) / 2;
}

export interface LevelInfo {
    level: number;
    /** 当前级内已获得 */
    into: number;
    /** 升到下一级还需要的总量（级内） */
    need: number;
    ratio: number;
}

export function levelFromXp(xp: number): LevelInfo {
    let level = 1;
    while (xp >= xpForLevel(level + 1)) level++;
    const base = xpForLevel(level);
    const need = xpForLevel(level + 1) - base;
    return { level, into: xp - base, need, ratio: need ? (xp - base) / need : 1 };
}

/** 等级称号（里程碑奖励）：到达对应等级时解锁 */
export const LEVEL_TITLES: Array<{ level: number; title: string }> = [
    { level: 1, title: '拼图新手' },
    { level: 3, title: '像素学徒' },
    { level: 5, title: '拼图达人' },
    { level: 8, title: '像素搭子' },
    { level: 12, title: '收藏家' },
    { level: 16, title: '拼图大师' },
    { level: 20, title: '传说搭子' },
];

export function titleForLevel(level: number): string {
    let t = LEVEL_TITLES[0].title;
    for (const e of LEVEL_TITLES) if (level >= e.level) t = e.title;
    return t;
}

/** 升级到 level 时是否解锁了新称号 */
export function newTitleAt(level: number): string | null {
    const e = LEVEL_TITLES.find((x) => x.level === level);
    return e && level > 1 ? e.title : null;
}

// ---------------------------------------------------------------- 每日任务

export type MissionKind = 'complete' | 'three_star' | 'collect_new' | 'daily_challenge' | 'no_hint' | 'grid4plus';

export interface MissionDef {
    id: string;
    kind: MissionKind;
    target: number;
    xp: number;
    title: string;
}

export const MISSION_POOL: MissionDef[] = [
    { id: 'complete_2', kind: 'complete', target: 2, xp: 20, title: '完成 2 局拼图' },
    { id: 'complete_3', kind: 'complete', target: 3, xp: 30, title: '完成 3 局拼图' },
    { id: 'three_star', kind: 'three_star', target: 1, xp: 30, title: '拿到 1 次三星' },
    { id: 'collect_new', kind: 'collect_new', target: 1, xp: 25, title: '收藏 1 件新作品' },
    { id: 'daily', kind: 'daily_challenge', target: 1, xp: 25, title: '完成今日挑战' },
    { id: 'no_hint', kind: 'no_hint', target: 1, xp: 25, title: '不用提示完成 1 局' },
    { id: 'grid4plus', kind: 'grid4plus', target: 1, xp: 30, title: '完成 1 局 4×4 或更大的拼图' },
];

const MISSION_BY_ID: Record<string, MissionDef> = {};
for (const m of MISSION_POOL) MISSION_BY_ID[m.id] = m;
export function getMission(id: string): MissionDef | undefined {
    return MISSION_BY_ID[id];
}

/**
 * 每天 3 个任务：由日期确定（同一天任何设备结果相同），三个任务类型互不相同；
 * 作品已经全部收藏时不会出现“收藏新作品”。
 */
export function selectDailyMissions(dateKey: string, allCollected: boolean): MissionDef[] {
    const rng = new SeededRandom(hashString(`pb-missions|${dateKey}`));
    const pool = MISSION_POOL.filter((m) => !(allCollected && m.kind === 'collect_new'));
    const picked: MissionDef[] = [];
    const kinds = new Set<MissionKind>();
    let guard = 0;
    while (picked.length < 3 && guard++ < 200) {
        const m = pool[rng.int(pool.length)];
        if (kinds.has(m.kind)) continue;
        kinds.add(m.kind);
        picked.push(m);
    }
    // 难度由低到高排序：先“完成 N 局”这类，再到三星/无提示
    const order: MissionKind[] = ['complete', 'collect_new', 'daily_challenge', 'grid4plus', 'no_hint', 'three_star'];
    return picked.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

// ---------------------------------------------------------------- 每周挑战

export type WeeklyKind = 'complete' | 'theme' | 'three_star';

export interface WeeklyObjectiveDef {
    id: string;
    kind: WeeklyKind;
    target: number;
    xp: number;
    title: string;
}

export interface WeeklyChallenge {
    weekKey: string;
    theme: SeriesInfo;
    objectives: WeeklyObjectiveDef[];
}

/** 本周周一的日期键（周一为一周之始，使用本地日期） */
export function weekKeyOf(dateKey: string): string {
    const [y, m, d] = dateKey.split('-').map((v) => parseInt(v, 10));
    const dow = new Date(y, m - 1, d, 12).getDay(); // 0 = 周日
    return shiftDateKey(dateKey, -((dow + 6) % 7));
}

/** 每周挑战由周一日期确定：主题轮换，三个目标由易到难 */
export function generateWeekly(weekKey: string): WeeklyChallenge {
    const [y, m, d] = weekKey.split('-').map((v) => parseInt(v, 10));
    const weekIndex = Math.floor(Date.UTC(y, m - 1, d) / 86400000 / 7);
    const theme = SERIES_LIST[((weekIndex % SERIES_LIST.length) + SERIES_LIST.length) % SERIES_LIST.length];
    const rng = new SeededRandom(hashString(`pb-weekly|${weekKey}`));
    const nComplete = 5 + rng.int(3); // 5–7
    const nTheme = 3 + rng.int(2); // 3–4
    const nStar = 2 + rng.int(2); // 2–3
    return {
        weekKey,
        theme,
        objectives: [
            { id: 'w_complete', kind: 'complete', target: nComplete, xp: 30, title: `本周完成 ${nComplete} 局拼图` },
            { id: 'w_theme', kind: 'theme', target: nTheme, xp: 50, title: `完成 ${nTheme} 局「${theme.name}」系列拼图` },
            { id: 'w_three_star', kind: 'three_star', target: nStar, xp: 80, title: `本周拿到 ${nStar} 次三星` },
        ],
    };
}

// ---------------------------------------------------------------- 成就

export interface AchievementStats {
    puzzlesCompleted: number;
    threeStars: number;
    dailyChallenges: number;
    missionDays: number;
    weeklyCompleted: number;
    friendChallenges: number;
    friendWins: number;
    collectedCount: number;
    seriesDone: number;
    /** 通关极限模式的作品数 */
    extremeCleared: number;
}

export interface AchievementDef {
    id: string;
    title: string;
    desc: string;
    target: number;
    xp: number;
    icon: string;
    value: (s: AchievementStats) => number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
    { id: 'first_puzzle', title: '初次拼好', desc: '完成第一局拼图', target: 1, xp: 20, icon: 'puzzle', value: (s) => s.puzzlesCompleted },
    { id: 'first_three_star', title: '三星时刻', desc: '第一次拿到三星', target: 1, xp: 30, icon: 'star', value: (s) => s.threeStars },
    { id: 'puzzles_10', title: '十局达人', desc: '累计完成 10 局拼图', target: 10, xp: 50, icon: 'steps', value: (s) => s.puzzlesCompleted },
    { id: 'puzzles_50', title: '五十局老手', desc: '累计完成 50 局拼图', target: 50, xp: 120, icon: 'trophy', value: (s) => s.puzzlesCompleted },
    { id: 'first_series', title: '第一个系列', desc: '集齐任意一个主题系列', target: 1, xp: 80, icon: 'book', value: (s) => s.seriesDone },
    { id: 'collect_all', title: '全收藏', desc: `收藏全部 ${ART_LIST.length} 件作品`, target: ART_LIST.length, xp: 150, icon: 'crown', value: (s) => s.collectedCount },
    { id: 'all_missions', title: '任务达人', desc: '在同一天完成全部每日任务', target: 1, xp: 60, icon: 'check', value: (s) => s.missionDays },
    { id: 'daily_7', title: '每日坚持', desc: '累计完成 7 次每日挑战', target: 7, xp: 100, icon: 'calendar', value: (s) => s.dailyChallenges },
    { id: 'weekly_1', title: '周挑战达成', desc: '完成 1 次每周挑战', target: 1, xp: 100, icon: 'flame', value: (s) => s.weeklyCompleted },
    { id: 'friend_win', title: '赢了好友', desc: '在好友挑战中取胜', target: 1, xp: 60, icon: 'users', value: (s) => s.friendWins },
    { id: 'extreme_1', title: '极限挑战者', desc: '通关 1 次极限模式', target: 1, xp: 120, icon: 'flame', value: (s) => s.extremeCleared },
    { id: 'extreme_3', title: '极限收藏家', desc: '通关 3 件作品的极限模式', target: 3, xp: 200, icon: 'crown', value: (s) => s.extremeCleared },
];

const ACH_BY_ID: Record<string, AchievementDef> = {};
for (const a of ACHIEVEMENTS) ACH_BY_ID[a.id] = a;
export function getAchievement(id: string): AchievementDef | undefined {
    return ACH_BY_ID[id];
}
