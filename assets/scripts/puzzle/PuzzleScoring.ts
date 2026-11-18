import { DIFFICULTIES, EXTREME, GridSize, MAX_STARS_BY_HINTS } from '../config/GameConfig';

export interface PuzzleResult {
    imageId: string;
    grid: GridSize;
    seed: number;
    timeMs: number;
    moves: number;
    hintsUsed: number;
    peekCount: number;
    undoCount: number;
    /** 开局时还原所需最少步数 */
    optimalMoves: number;
    /** 极限模式 */
    extreme?: boolean;
}

export interface StarBreakdown {
    stars: 1 | 2 | 3;
    timeStars: number;
    moveStars: number;
    hintCap: number;
    /** 三星所需：时间上限（秒）与步数上限 */
    threeStarSeconds: number;
    threeStarMoves: number;
    /** 二星所需的步数上限 */
    twoStarMoves: number;
}

/**
 * 星级 = min(时间星, 步数星, 提示上限)，完成即至少 1 星。
 * 阈值按难度配置；步数阈值相对“最优步数”计算，因此不同打乱结果之间是公平的。
 */
export function computeStars(r: Pick<PuzzleResult, 'grid' | 'timeMs' | 'moves' | 'hintsUsed' | 'optimalMoves' | 'extreme'>): StarBreakdown {
    const cfg = r.extreme ? EXTREME.stars : DIFFICULTIES[r.grid].stars;
    const seconds = r.timeMs / 1000;
    const opt = Math.max(1, r.optimalMoves);
    const threeStarMoves = Math.ceil(opt * cfg.threeStarMoveRatio);
    const twoStarMoves = Math.ceil(opt * cfg.twoStarMoveRatio);

    const timeStars = seconds <= cfg.threeStarSeconds ? 3 : seconds <= cfg.twoStarSeconds ? 2 : 1;
    const moveStars = r.moves <= threeStarMoves ? 3 : r.moves <= twoStarMoves ? 2 : 1;
    const hintIdx = Math.min(Math.max(0, r.hintsUsed), MAX_STARS_BY_HINTS.length - 1);
    const hintCap = MAX_STARS_BY_HINTS[hintIdx];

    const stars = Math.max(1, Math.min(timeStars, moveStars, hintCap)) as 1 | 2 | 3;
    return { stars, timeStars, moveStars, hintCap, threeStarSeconds: cfg.threeStarSeconds, threeStarMoves, twoStarMoves };
}

/** 个人纪录比较：时间优先，时间相同比步数 */
export function isBetterRecord(a: { timeMs: number; moves: number }, best?: { timeMs: number; moves: number } | null): boolean {
    if (!best || !(best.timeMs > 0)) return true;
    if (a.timeMs !== best.timeMs) return a.timeMs < best.timeMs;
    return a.moves < best.moves;
}

/**
 * 拼图时顶部的步数文字：先显示“已用/三星上限”，超过后换成“已用/二星上限”，再超过就只显示步数（一星不限步数）。
 */
export function movesHudText(moves: number, b: Pick<StarBreakdown, 'threeStarMoves' | 'twoStarMoves'>): string {
    if (moves <= b.threeStarMoves) return `${moves}/${b.threeStarMoves} 步`;
    if (moves <= b.twoStarMoves) return `${moves}/${b.twoStarMoves} 步`;
    return `${moves} 步`;
}
