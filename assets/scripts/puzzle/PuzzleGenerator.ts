import { DIFFICULTIES, GridSize, isGridSize, maxSwaps } from '../config/GameConfig';
import { SeededRandom } from '../core/Random';
import { shuffleOrder } from './PuzzleShuffle';
import { isPermutation, minSwapsToSolve } from './PuzzleValidator';

/** 单个方块的核心数据 */
export interface PieceData {
    /** 方块 ID，等于原始位置索引 */
    id: number;
    /** 原始（正确）位置：行优先索引 */
    correctIndex: number;
    /** 当前位置 */
    currentIndex: number;
    /** 所属图片 ID */
    imageId: string;
    /** 是否已正确归位 */
    isCorrect: boolean;
}

/** 一道题目的完整描述：同样的 (imageId, grid, seed) 一定生成同样的布局 */
export interface PuzzleSpec {
    imageId: string;
    grid: GridSize;
    seed: number;
    /** 可选：覆盖难度配置的交换次数（仅新手渐进使用；挑战/每日不设置，保证两端布局一致） */
    swaps?: number;
    /** 打乱方式：默认两两互换；'full' = 地狱模式，所有可打乱的方块都不在原位（随机错排） */
    shuffle?: 'full';
    /** 极限模式（经典玩法里更高一档）：同样整盘打乱，但仍评星、仍锁定拼对的方块；见 EXTREME */
    extreme?: boolean;
}

export interface PuzzleLayout extends PuzzleSpec {
    /** 实际使用的交换次数 */
    swaps: number;
    /** order[cell] = 位于该格子的方块 ID */
    order: number[];
}

/**
 * @param fixedCells 不参与打乱的格子（与其他格子像素完全相同的方块，见 identicalTileCells）。
 *   由作品画面决定，因此好友挑战/每日挑战两端算出的结果一致。
 */
export function generateLayout(spec: PuzzleSpec, fixedCells: readonly number[] = []): PuzzleLayout {
    if (!isGridSize(spec.grid)) throw new Error(`不支持的网格：${spec.grid}`);
    if (!spec.imageId) throw new Error('缺少图片 ID');
    const n = spec.grid * spec.grid;
    const rng = new SeededRandom(spec.seed >>> 0);
    const fixed = fixedCells.filter((c) => c >= 0 && c < n);
    const free = n - new Set(fixed).size;
    const want = Math.max(1, Math.min(maxSwaps(spec.grid), spec.swaps ?? DIFFICULTIES[spec.grid].swaps));
    // 可打乱的格子不够时少换几次；连一次都换不了（几乎纯色的作品）就退回普通打乱，保证总能出题
    const useFixed = free >= 2;
    if (spec.shuffle === 'full' || spec.extreme) {
        const order = fullShuffle(n, rng, useFixed ? fixed : []);
        return { imageId: spec.imageId, grid: spec.grid, seed: spec.seed >>> 0, swaps: minSwapsToSolve(order), order, ...(spec.extreme ? { extreme: true } : { shuffle: 'full' as const }) };
    }
    const swaps = useFixed ? Math.min(want, Math.floor(free / 2)) : want;
    const order = shuffleOrder(n, rng, swaps, useFixed ? fixed : []);
    return { imageId: spec.imageId, grid: spec.grid, seed: spec.seed >>> 0, swaps, order };
}

/**
 * 随机错排：fixed 以外的每一块都不在自己的位置上（Fisher-Yates 洗牌，有块留在原位就重洗）。
 * 可打乱的块 ≥ 2 时一定能找到，平均约 2.7 次。
 */
export function fullShuffle(n: number, rng: SeededRandom, fixed: readonly number[] = []): number[] {
    const skip = new Set(fixed);
    const cells: number[] = [];
    for (let i = 0; i < n; i++) if (!skip.has(i)) cells.push(i);
    const order: number[] = [];
    for (let i = 0; i < n; i++) order.push(i);
    if (cells.length < 2) return order;
    for (let attempt = 0; attempt < 200; attempt++) {
        const pieces = cells.slice();
        for (let i = pieces.length - 1; i > 0; i--) {
            const j = rng.int(i + 1);
            const t = pieces[i];
            pieces[i] = pieces[j];
            pieces[j] = t;
        }
        if (pieces.every((p, k) => p !== cells[k])) {
            cells.forEach((c, k) => (order[c] = pieces[k]));
            return order;
        }
    }
    // 理论上不会走到：整体轮换一格，必然全部错位
    cells.forEach((c, k) => (order[c] = cells[(k + 1) % cells.length]));
    return order;
}

/** 由布局生成方块数据列表（按方块 ID 排序） */
export function buildPieces(layout: PuzzleLayout): PieceData[] {
    const n = layout.grid * layout.grid;
    if (!isPermutation(layout.order, n)) throw new Error('非法布局：方块丢失或重复');
    const pieces: PieceData[] = new Array(n);
    for (let cell = 0; cell < n; cell++) {
        const id = layout.order[cell];
        pieces[id] = { id, correctIndex: id, currentIndex: cell, imageId: layout.imageId, isCorrect: id === cell };
    }
    return pieces;
}

/** 方块在原图中的行列（用于切图） */
export function pieceSourceRect(id: number, grid: number, artSize: number): { x: number; y: number; w: number; h: number } {
    const size = artSize / grid;
    const col = id % grid;
    const row = Math.floor(id / grid);
    return { x: col * size, y: row * size, w: size, h: size };
}
