import { ART_LIST, ArtCategory, ArtInfo, getArt } from '../art/ArtCatalog';
import { EXTREME, GridSize, isExtremeKey, recordKeyFor, SUPPORTED_GRIDS } from '../config/GameConfig';
import { computeStars, isBetterRecord, PuzzleResult, StarBreakdown } from '../puzzle/PuzzleScoring';
import { SaveManager } from '../storage/SaveManager';
import { getSeries, SERIES_LIST, seriesOfItem, seriesState, SeriesInfo, SeriesState } from './SeriesCatalog';
import { LevelRecord } from '../storage/SaveSchema';

export interface RecordUpdate {
    breakdown: StarBreakdown;
    /** 本次之前的最佳纪录（无则为 null） */
    previousBest: LevelRecord | null;
    /** 本次之后的纪录 */
    best: LevelRecord;
    isNewRecord: boolean;
    /** 本次是否首次收集该作品 */
    newlyCollected: boolean;
    /** 本次是否因星数增加解锁了新的关卡图片 */
    newlyUnlocked: ArtInfo[];
    /** 作品所属系列的进度（工坊作品等不属于系列时为 null） */
    series: SeriesUpdate | null;
}

export interface SeriesUpdate {
    info: SeriesInfo;
    before: number;
    after: number;
    total: number;
    /** 本次完成拼图使系列刚好集齐 */
    justCompleted: boolean;
}

export interface SeriesProgress {
    info: SeriesInfo;
    collected: number;
    total: number;
    remaining: number;
    ratio: number;
    state: SeriesState;
    done: boolean;
    /** 奖励记录（已集齐才有） */
    reward: { at: number; seen: boolean } | null;
}

export interface ItemDetail {
    art: ArtInfo;
    series: SeriesInfo | undefined;
    collected: boolean;
    unlockedAt: number;
    bestStars: number;
    bestTimeMs: number;
    bestMoves: number;
    completions: number;
}

export interface CollectionEntry {
    art: ArtInfo;
    collected: boolean;
    /** 各难度纪录 */
    records: Partial<Record<GridSize, LevelRecord>>;
    /** 所有难度中的最高星级 */
    bestStars: number;
    /** 所有难度中最快的时间（毫秒，0 表示无） */
    bestTimeMs: number;
}

/**
 * 关卡纪录与作品收藏（纯逻辑，基于 SaveManager）。
 * 规则：
 * - 完成任意难度（含每日挑战、好友挑战）即收藏该作品；
 * - 经典模式的图片按“总星数”逐步开放（ArtInfo.unlockStars）。
 */
export class CollectionManager {
    constructor(private readonly save: SaveManager, private readonly now: () => number = () => Date.now()) {}

    getRecord(imageId: string, grid: GridSize, extreme = false): LevelRecord | null {
        const r = this.save.data.records[imageId];
        return (r && r[recordKeyFor(grid, extreme)]) || null;
    }

    /** 极限模式纪录（独立存放，不计入总星数） */
    getExtremeRecord(imageId: string): LevelRecord | null {
        return this.getRecord(imageId, EXTREME.grid, true);
    }

    /** 已通关极限模式的作品数 */
    extremeClearedCount(): number {
        let n = 0;
        for (const a of ART_LIST) if (this.getExtremeRecord(a.id)) n++;
        return n;
    }

    /** 5×5 及以上难度（普通难度）的完成局数，用于解锁极限模式 */
    bigGridCompletions(): number {
        let n = 0;
        const recs = this.save.data.records;
        for (const id of Object.keys(recs)) {
            for (const g of Object.keys(recs[id])) {
                if (isExtremeKey(g)) continue;
                if (parseInt(g, 10) >= 5) n += recs[id][g].completions | 0;
            }
        }
        return n;
    }

    /** 总星数 = 每张图每个难度的最佳星级之和 */
    totalStars(): number {
        let sum = 0;
        const recs = this.save.data.records;
        for (const id of Object.keys(recs)) {
            if (!getArt(id)) continue;
            for (const g of Object.keys(recs[id])) if (!isExtremeKey(g)) sum += Math.max(0, Math.min(3, recs[id][g].bestStars | 0));
        }
        return sum;
    }

    maxStars(): number {
        return ART_LIST.length * SUPPORTED_GRIDS.length * 3;
    }

    isPlayable(imageId: string): boolean {
        const art = getArt(imageId);
        if (!art) return false;
        return this.totalStars() >= art.unlockStars || this.isCollected(imageId);
    }

    isCollected(imageId: string): boolean {
        return !!this.save.data.collected[imageId];
    }

    collectedCount(): number {
        return ART_LIST.filter((a) => this.isCollected(a.id)).length;
    }

    /** 记录一局结果（经典/每日/好友模式都会调用） */
    recordResult(result: PuzzleResult): RecordUpdate {
        const breakdown = computeStars(result);
        const key = recordKeyFor(result.grid, result.extreme);
        const prev = this.getRecord(result.imageId, result.grid, !!result.extreme);
        const previousBest = prev ? { ...prev } : null;
        const starsBefore = this.totalStars();
        const playableBefore = ART_LIST.filter((a) => this.isPlayable(a.id)).map((a) => a.id);
        const newlyCollected = !this.isCollected(result.imageId);
        const sInfo = seriesOfItem(result.imageId);
        const seriesBefore = sInfo ? this.seriesProgress(sInfo.id).collected : 0;
        const isNewRecord = isBetterRecord({ timeMs: result.timeMs, moves: result.moves }, prev ? { timeMs: prev.bestTimeMs, moves: prev.bestMoves } : null);

        this.save.mutate((d) => {
            if (!d.records[result.imageId]) d.records[result.imageId] = {};
            const cur = d.records[result.imageId][key];
            const t = this.now();
            if (!cur) {
                d.records[result.imageId][key] = {
                    bestTimeMs: result.timeMs,
                    bestMoves: result.moves,
                    bestStars: breakdown.stars,
                    completions: 1,
                    lastPlayedAt: t,
                };
            } else {
                if (isNewRecord) {
                    cur.bestTimeMs = result.timeMs;
                    cur.bestMoves = result.moves;
                }
                cur.bestStars = Math.max(cur.bestStars, breakdown.stars);
                cur.completions += 1;
                cur.lastPlayedAt = t;
            }
            if (!d.collected[result.imageId]) d.collected[result.imageId] = t;
            d.totalCompletions += 1;
            // 集齐系列：自动发放一次奖励（已有记录则不再发放，刷同一张图没有额外收益）
            if (sInfo && sInfo.items.every((id) => !!d.collected[id]) && !d.rewards[sInfo.id]) d.rewards[sInfo.id] = { at: t, seen: false };
        });

        const best = this.getRecord(result.imageId, result.grid, !!result.extreme)!;
        const newlyUnlocked: ArtInfo[] = [];
        if (this.totalStars() > starsBefore) {
            for (const a of ART_LIST) if (!playableBefore.includes(a.id) && this.isPlayable(a.id)) newlyUnlocked.push(a);
        }
        const seriesAfter = sInfo ? this.seriesProgress(sInfo.id) : null;
        const series: SeriesUpdate | null = sInfo && seriesAfter ? { info: sInfo, before: seriesBefore, after: seriesAfter.collected, total: seriesAfter.total, justCompleted: seriesBefore < seriesAfter.total && seriesAfter.done } : null;
        return { breakdown, previousBest, best: { ...best }, isNewRecord, newlyCollected, newlyUnlocked, series };
    }

    // ------------------------------------------------------------ 主题系列

    seriesProgress(seriesId: string): SeriesProgress {
        const info = getSeries(seriesId)!;
        const collected = info.items.filter((id) => this.isCollected(id)).length;
        const total = info.items.length;
        const reward = this.save.data.rewards[seriesId];
        return {
            info,
            collected,
            total,
            remaining: total - collected,
            ratio: total ? collected / total : 0,
            state: seriesState(collected, total),
            done: collected >= total,
            reward: reward ? { ...reward } : null,
        };
    }

    allSeries(): SeriesProgress[] {
        return SERIES_LIST.map((s) => this.seriesProgress(s.id));
    }

    /** 总览：已收藏/总数、已完成系列数 */
    overall(): { collected: number; total: number; ratio: number; seriesDone: number; seriesTotal: number } {
        const all = this.allSeries();
        const collected = all.reduce((a, s) => a + s.collected, 0);
        const total = all.reduce((a, s) => a + s.total, 0);
        return { collected, total, ratio: total ? collected / total : 0, seriesDone: all.filter((s) => s.done).length, seriesTotal: all.length };
    }

    /**
     * 补发奖励：旧存档里已经集齐的系列，在升级后第一次进入时补上记录（seen=false，
     * 之后展示一次庆祝页）。返回本次补发的系列 ID。
     */
    syncRewards(): string[] {
        const granted: string[] = [];
        const t = this.now();
        for (const s of this.allSeries()) {
            if (s.done && !this.save.data.rewards[s.info.id]) granted.push(s.info.id);
        }
        if (granted.length) {
            this.save.mutate((d) => {
                for (const id of granted) if (!d.rewards[id]) d.rewards[id] = { at: t, seen: false };
            }, true);
        }
        return granted;
    }

    /** 已获得但庆祝页还没看过的奖励（按获得时间排序） */
    unseenRewards(): string[] {
        const r = this.save.data.rewards;
        return Object.keys(r).filter((id) => !r[id].seen).sort((a, b) => r[a].at - r[b].at);
    }

    /** 玩家收下奖励；只有第一次返回 true（用于只记录一次事件） */
    markRewardSeen(seriesId: string): boolean {
        const r = this.save.data.rewards[seriesId];
        if (!r || r.seen) return false;
        this.save.mutate((d) => {
            d.rewards[seriesId].seen = true;
        }, true);
        return true;
    }

    /** 已获得的系列奖励（头像框使用最近获得的一个） */
    earnedRewards(): SeriesInfo[] {
        const r = this.save.data.rewards;
        return Object.keys(r).filter((id) => !!getSeries(id)).sort((a, b) => r[b].at - r[a].at).map((id) => getSeries(id)!);
    }

    /** 最近解锁的作品 */
    latestUnlocked(): ArtInfo | null {
        const c = this.save.data.collected;
        const ids = ART_LIST.filter((a) => !!c[a.id]).sort((a, b) => c[b.id] - c[a.id]);
        return ids.length ? ids[0] : null;
    }

    /** 离奖励最近的未完成系列（首页展示“还差几件”） */
    nextRewardSeries(): SeriesProgress | null {
        const open = this.allSeries().filter((s) => !s.done);
        if (!open.length) return null;
        open.sort((a, b) => a.remaining - b.remaining || b.collected - a.collected);
        return open[0];
    }

    /**
     * 系列只剩最后一件时的状态。playable=false 说明还没达到星星解锁条件，
     * 界面不能提前说“最后一件！集齐领奖”，而应告诉玩家还差多少颗星。
     */
    finalItem(seriesId: string): { art: ArtInfo; playable: boolean; starsNeeded: number } | null {
        const s = this.seriesProgress(seriesId);
        if (s.remaining !== 1) return null;
        const id = s.info.items.find((i) => !this.isCollected(i));
        const art = id ? getArt(id) : undefined;
        if (!art) return null;
        const playable = this.isPlayable(art.id);
        return { art, playable, starsNeeded: playable ? 0 : Math.max(1, art.unlockStars - this.totalStars()) };
    }

    itemDetail(itemId: string): ItemDetail | null {
        const art = getArt(itemId);
        if (!art) return null;
        let bestStars = 0, bestTimeMs = 0, bestMoves = 0, completions = 0;
        for (const g of SUPPORTED_GRIDS) {
            const r = this.getRecord(itemId, g);
            if (!r) continue;
            completions += r.completions;
            bestStars = Math.max(bestStars, r.bestStars);
            if (r.bestTimeMs > 0 && (bestTimeMs === 0 || r.bestTimeMs < bestTimeMs)) {
                bestTimeMs = r.bestTimeMs;
                bestMoves = r.bestMoves;
            }
        }
        return { art, series: seriesOfItem(itemId), collected: this.isCollected(itemId), unlockedAt: this.save.data.collected[itemId] || 0, bestStars, bestTimeMs, bestMoves, completions };
    }

    /** 开始一局时调用（统计总游戏次数） */
    recordPlayStarted(): void {
        this.save.mutate((d) => {
            d.totalPlays += 1;
        });
    }

    getEntries(category?: ArtCategory): CollectionEntry[] {
        return ART_LIST.filter((a) => !category || a.category === category).map((art) => {
            const records: Partial<Record<GridSize, LevelRecord>> = {};
            let bestStars = 0;
            let bestTimeMs = 0;
            for (const g of SUPPORTED_GRIDS) {
                const r = this.getRecord(art.id, g);
                if (!r) continue;
                records[g] = r;
                bestStars = Math.max(bestStars, r.bestStars);
                if (r.bestTimeMs > 0 && (bestTimeMs === 0 || r.bestTimeMs < bestTimeMs)) bestTimeMs = r.bestTimeMs;
            }
            return { art, collected: this.isCollected(art.id), records, bestStars, bestTimeMs };
        });
    }

    /** “开始拼图”快捷入口：优先推荐未收藏且已开放的图 */
    suggestNext(): ArtInfo {
        const playable = ART_LIST.filter((a) => this.isPlayable(a.id));
        const fresh = playable.find((a) => !this.isCollected(a.id));
        if (fresh) return fresh;
        // 都收藏过了：推荐星数最低的
        let pick = playable[0] || ART_LIST[0];
        let low = 99;
        for (const a of playable) {
            const s = SUPPORTED_GRIDS.reduce((acc, g) => acc + (this.getRecord(a.id, g)?.bestStars || 0), 0);
            if (s < low) {
                low = s;
                pick = a;
            }
        }
        return pick;
    }
}
