/**
 * 游戏玩法配置（纯数据，不依赖 cc）。
 * 难度、评分阈值、提示次数、每日挑战规则都集中在这里，避免在逻辑中硬编码。
 */

export type GridSize = 3 | 4 | 5 | 6;

export interface StarThresholds {
    /** 三星时间上限（秒） */
    threeStarSeconds: number;
    /** 两星时间上限（秒） */
    twoStarSeconds: number;
    /** 三星步数上限 = 最优步数 × 该系数（向上取整） */
    threeStarMoveRatio: number;
    /** 两星步数上限 = 最优步数 × 该系数（向上取整） */
    twoStarMoveRatio: number;
}

export interface DifficultyConfig {
    grid: GridSize;
    /** 面向玩家的名称 */
    label: string;
    /** 简短说明 */
    desc: string;
    /** 每局免费“定位提示”次数 */
    freeHints: number;
    /**
     * 开局需要交换的次数（= 最少步数）。
     * 打乱方式：随机选出 2×swaps 个互不重复的格子，两两互换；其余方块开局就在正确位置并锁定。
     * 因此错位方块数恒为 2×swaps，恰好 swaps 次交换即可还原。
     */
    swaps: number;
    /** 一句话难度说明（难度选择页展示） */
    blurb: string;
    stars: StarThresholds;
}

export const DIFFICULTIES: Record<GridSize, DifficultyConfig> = {
    3: {
        grid: 3,
        label: '入门',
        desc: '3×3 · 9 块',
        freeHints: 3,
        swaps: 1,
        blurb: '只有 2 块放错，换 1 次就完成',
        stars: { threeStarSeconds: 30, twoStarSeconds: 80, threeStarMoveRatio: 1.34, twoStarMoveRatio: 2.0 },
    },
    4: {
        grid: 4,
        label: '简单',
        desc: '4×4 · 16 块',
        freeHints: 3,
        swaps: 3,
        blurb: '6 块放错，轻松热身',
        stars: { threeStarSeconds: 45, twoStarSeconds: 120, threeStarMoveRatio: 1.25, twoStarMoveRatio: 1.8 },
    },
    5: {
        grid: 5,
        label: '普通',
        desc: '5×5 · 25 块',
        freeHints: 3,
        swaps: 6,
        blurb: '12 块放错，需要一点观察',
        stars: { threeStarSeconds: 120, twoStarSeconds: 270, threeStarMoveRatio: 1.3, twoStarMoveRatio: 1.9 },
    },
    6: {
        grid: 6,
        label: '困难',
        desc: '6×6 · 36 块',
        freeHints: 4,
        swaps: 9,
        blurb: '18 块放错，考验耐心',
        stars: { threeStarSeconds: 210, twoStarSeconds: 420, threeStarMoveRatio: 1.35, twoStarMoveRatio: 2.0 },
    },
};

export const SUPPORTED_GRIDS: GridSize[] = [3, 4, 5, 6];

/**
 * 极限模式（比“困难 6×6”更高一档，只用于经典模式）：
 * - 整盘打乱：没有“开局就放对”的送分方块（36 块全部错位，且不存在固定点）；
 * - 目标图隐藏，只能“按住看原图” maxPeeks 次；
 * - 免费提示只有 freeHints 次；
 * - 星级按自己的阈值计算，成绩存在独立的纪录键里，不计入总星数（不影响图片解锁）；
 * - 首次通关某张图的极限模式获得 xp 点经验。
 * 解锁条件：任意一局 5×5 及以上完成过（让玩家先熟悉规则，也让它成为一个“目标”）。
 */
export const EXTREME = {
    grid: 6 as GridSize,
    label: '极限',
    desc: '6×6 · 36 块 · 整盘打乱',
    blurb: '没有送分方块，目标图只能偷看 3 次，提示仅 1 次',
    freeHints: 1,
    maxPeeks: 3,
    xp: 90,
    /** 纪录键（records[imageId][key]）；不是纯数字，所以不会被当作普通难度统计 */
    recordKey: 'x6',
    stars: { threeStarSeconds: 300, twoStarSeconds: 600, threeStarMoveRatio: 1.25, twoStarMoveRatio: 1.7 } as StarThresholds,
    /** 解锁所需：5×5 及以上难度的完成局数 */
    unlockCompletions: 1,
};

/** 纪录键：普通难度为网格数字符串，极限模式为 EXTREME.recordKey */
export function recordKeyFor(grid: GridSize, extreme?: boolean): string {
    return extreme ? EXTREME.recordKey : String(grid);
}

/** 纪录键是否属于极限模式 */
export function isExtremeKey(key: string): boolean {
    return key === EXTREME.recordKey;
}

/** 极限模式是否已解锁 */
export function isExtremeUnlocked(bigGridCompletions: number): boolean {
    return bigGridCompletions >= EXTREME.unlockCompletions;
}

/** 新手（还没完成过任何一局）推荐的难度 */
export const BEGINNER_GRID: GridSize = 3;

/** 错位方块数 = 2 × 交换次数 */
export function misplacedCount(swaps: number): number {
    return swaps * 2;
}

/** 某个难度允许的最大交换次数：每次交换用掉 2 个互不重复的格子 */
export function maxSwaps(grid: GridSize): number {
    return Math.floor((grid * grid) / 2);
}

/**
 * 新手渐进：前 3 局入门拼图分别需要换 1、2、3 次，之后恢复为配置值。
 * @param beginnerCompletions 已完成的 3×3 局数
 * @returns 本局的交换次数；超过 3 局返回 null（使用难度配置）
 */
export function beginnerSwaps(beginnerCompletions: number): number | null {
    return beginnerCompletions >= 0 && beginnerCompletions < 3 ? beginnerCompletions + 1 : null;
}

/** 根据已完成总局数推荐的难度；老玩家返回 null */
export function recommendedGrid(totalCompletions: number): GridSize | null {
    if (totalCompletions < 3) return 3;
    if (totalCompletions < 6) return 4;
    if (totalCompletions < 10) return 5;
    return null;
}

export function isGridSize(v: unknown): v is GridSize {
    return v === 3 || v === 4 || v === 5 || v === 6;
}

/**
 * 提示对星级的上限影响：index = 已使用定位提示次数（超出数组长度取最后一个）。
 * 例如用了 1 次提示，最多 2 星；用了 3 次及以上，最多 1 星。
 */
export const MAX_STARS_BY_HINTS = [3, 2, 2, 1];

export const GAMEPLAY = {
    /** 已归位的方块是否锁定（不可再拖动），降低挫败感 */
    lockCorrectPieces: true,
    /** 原图预览是否计入“提示次数”（计入单独的 peekCount，不影响星级） */
    peekAffectsStars: false,
    /** 撤销是否扣除步数：否，撤销本身也不计步，但记录撤销次数 */
    maxUndoDepth: 20,
};

export const DAILY = {
    /** 每日挑战固定难度（简单 4×4，人人都能完成） */
    grid: 4 as GridSize,
    /** 每日挑战种子盐值；修改会改变所有日期的题目，请勿随意改动 */
    salt: 'pixel-buddies-daily-v1',
};

/**
 * 地狱模式：5×5，所有可打乱的方块全部打乱（不是两两互换）；
 * 拼对没有音效/震动/进度提示，拼对的方块也能再拖走，没有提示，不显示时间和步数限制，拼完才结算。
 * 成绩单独记录，不影响普通模式的星级和收藏。
 */
export const HELL = {
    grid: 5 as GridSize,
    label: '地狱',
    desc: '全部打乱 · 无提示 · 不锁定',
};

export const CHALLENGE = {
    /** 挑战数据格式版本。
     *  v2：打乱时排除“长得一模一样”的方块（见 TileSignature）。旧版客户端收到 v2 会提示更新；
     *  新版客户端收到 v1 链接时按旧规则打乱，保证和发起方是同一个局面。 */
    version: 2,
    /** 从这个版本起，打乱时排除长得一样的方块 */
    identicalTilesFromVersion: 2,
    /** 校验盐值（仅用于完整性校验，非安全加密） */
    salt: 'pb-challenge-v1',
    /** 分享 query 中的键名 */
    queryKey: 'pb',
};

/** 每个格子的像素图分辨率（必须能被 4、5、6 整除） */
export const ART_SIZE = 60;
