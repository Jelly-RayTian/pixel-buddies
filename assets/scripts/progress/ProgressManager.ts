import { ART_LIST } from '../art/ArtCatalog';
import { isCustomId } from '../art/CustomArtStore';
import { CollectionManager, RecordUpdate } from '../collection/CollectionManager';
import { EXTREME, isExtremeKey, recordKeyFor } from '../config/GameConfig';
import { toDateKey } from '../daily/DailyChallengeManager';
import { PuzzleResult } from '../puzzle/PuzzleScoring';
import { SaveManager } from '../storage/SaveManager';
import { GoalState } from '../storage/SaveSchema';
import {
    ACHIEVEMENTS,
    AchievementDef,
    AchievementStats,
    DAILY_CHALLENGE_XP,
    FRIEND_CHALLENGE_XP,
    FRIEND_WIN_XP,
    generateWeekly,
    getAchievement,
    getMission,
    GRID_XP,
    levelFromXp,
    LevelInfo,
    MISSION_BONUS_XP,
    MissionDef,
    newTitleAt,
    selectDailyMissions,
    STAR_XP,
    titleForLevel,
    WEEKLY_COMPLETE_XP,
    WeeklyChallenge,
    weekKeyOf,
} from './ProgressConfig';

export type PlayMode = 'classic' | 'daily' | 'challenge-create' | 'challenge-accept';

export interface PuzzleEvent {
    result: PuzzleResult;
    rec: RecordUpdate;
    mode: PlayMode;
    dateKey?: string;
}

export interface GoalProgress {
    id: string;
    title: string;
    progress: number;
    target: number;
    xp: number;
    justCompleted: boolean;
}

export interface ProgressUpdate {
    xpGained: number;
    levelBefore: number;
    levelAfter: number;
    leveledUp: boolean;
    newTitle: string | null;
    missions: GoalProgress[];
    missionsAllDone: boolean;
    weekly: GoalProgress[];
    weeklyCompleted: boolean;
    achievements: AchievementDef[];
}

export interface ClaimResult {
    ok: boolean;
    xp: number;
    levelBefore: number;
    levelAfter: number;
    newTitle: string | null;
}

export interface MissionItemView {
    def: MissionDef;
    progress: number;
    done: boolean;
    claimed: boolean;
}

export interface WeeklyItemView {
    id: string;
    title: string;
    xp: number;
    target: number;
    progress: number;
    done: boolean;
    claimed: boolean;
}

export interface AchievementView {
    def: AchievementDef;
    progress: number;
    unlocked: boolean;
    claimed: boolean;
    at: number;
}

export interface NextStep {
    kind: 'daily' | 'series' | 'mission' | 'weekly' | 'classic';
    text: string;
    seriesId?: string;
}

const AWARDED_CAP = 300;

/**
 * 成长系统（纯逻辑，基于 SaveManager，不依赖 cc）：经验/等级、每日任务、每周挑战、成就。
 *
 * 防刷原则：
 * - 经验只来自“第一次”完成某作品某难度、星级首次提升、每日挑战每天一次、每个好友挑战一次，
 *   反复重玩同一张图不会再得经验（事件键记录在 awarded，有上限）；
 * - 任务/周目标/成就的奖励都只能领取一次；
 * - 工坊（照片）作品不发经验。
 */
export class ProgressManager {
    constructor(
        private readonly save: SaveManager,
        private readonly collection: CollectionManager,
        private readonly today: () => Date = () => new Date(),
        private readonly now: () => number = () => Date.now(),
    ) {
        this.bootstrap();
        this.refresh();
    }

    private get p() {
        return this.save.data.progress;
    }

    private todayKey(): string {
        return toDateKey(this.today());
    }

    // ------------------------------------------------------------ 初始化（旧存档补算）

    /**
     * 升级自旧版本时，用已有成绩补算经验和统计（只做一次）：保留老玩家的进度，
     * 同时把对应事件键记入 awarded，之后重玩不会再次发放。
     */
    private bootstrap(): void {
        const p = this.p;
        if (p.initialized) return;
        const d = this.save.data;
        let xp = 0;
        let threeStars = 0;
        for (const id of Object.keys(d.records)) {
            if (isCustomId(id)) continue;
            for (const g of Object.keys(d.records[id])) {
                const r = d.records[id][g];
                p.awarded.push(`p:${id}:${g}`);
                xp += (isExtremeKey(g) ? EXTREME.xp : GRID_XP[parseInt(g, 10)] || 10) + Math.max(0, r.bestStars - 1) * STAR_XP;
                if (r.bestStars >= 3) threeStars++;
            }
        }
        let dailies = 0;
        for (const k of Object.keys(d.daily)) {
            if (d.daily[k].completed) {
                dailies++;
                p.awarded.push(`d:${k}`);
                xp += DAILY_CHALLENGE_XP;
            }
        }
        p.xp = Math.max(p.xp, xp);
        p.stats.puzzlesCompleted = Math.max(p.stats.puzzlesCompleted, d.totalCompletions);
        p.stats.threeStars = Math.max(p.stats.threeStars, threeStars);
        p.stats.dailyChallenges = Math.max(p.stats.dailyChallenges, dailies);
        p.awarded = p.awarded.slice(-AWARDED_CAP);
        p.initialized = true;
        // 静默解锁已满足条件的成就（不弹窗，进入成就页可以领取）
        this.checkAchievements();
        this.save.mutate(() => undefined, true);
    }

    /** 跨天/跨周时刷新任务与周挑战；每次读取或更新前都会调用 */
    refresh(): void {
        const p = this.p;
        const dk = this.todayKey();
        let changed = false;
        if (p.missions.dateKey !== dk) {
            const all = this.collection.collectedCount() >= ART_LIST.length;
            p.missions = { dateKey: dk, items: selectDailyMissions(dk, all).map((m) => ({ id: m.id, progress: 0, claimed: false })), bonusClaimed: false, counted: false };
            changed = true;
        }
        const wk = weekKeyOf(dk);
        if (p.weekly.weekKey !== wk) {
            p.weekly = { weekKey: wk, items: generateWeekly(wk).objectives.map((o) => ({ id: o.id, progress: 0, claimed: false })), completed: false, completeClaimed: false };
            changed = true;
        }
        if (changed) this.save.mutate(() => undefined, true);
    }

    // ------------------------------------------------------------ 经验

    level(): LevelInfo {
        return levelFromXp(this.p.xp);
    }

    xp(): number {
        return this.p.xp;
    }

    title(): string {
        return titleForLevel(this.level().level);
    }

    private grantXp(n: number): { before: number; after: number; title: string | null } {
        const before = levelFromXp(this.p.xp).level;
        this.p.xp += Math.max(0, Math.floor(n));
        const after = levelFromXp(this.p.xp).level;
        let title: string | null = null;
        for (let l = before + 1; l <= after; l++) title = newTitleAt(l) || title;
        return { before, after, title };
    }

    /** 事件键去重：第一次返回 true */
    private once(key: string): boolean {
        const a = this.p.awarded;
        if (a.indexOf(key) >= 0) return false;
        a.push(key);
        if (a.length > AWARDED_CAP) a.splice(0, a.length - AWARDED_CAP);
        return true;
    }

    // ------------------------------------------------------------ 事件：完成一局

    onPuzzleCompleted(ev: PuzzleEvent): ProgressUpdate {
        this.refresh();
        const p = this.p;
        const { result, rec } = ev;
        const stars = rec.breakdown.stars;
        let xpGained = 0;

        // 1) 经验：首次完成该作品该难度；之后只有星级提升才有（每提升一星 STAR_XP）
        if (!isCustomId(result.imageId)) {
            const key = `p:${result.imageId}:${recordKeyFor(result.grid, result.extreme)}`;
            const baseXp = result.extreme ? EXTREME.xp : GRID_XP[result.grid] || 10;
            if (this.once(key)) xpGained += baseXp + Math.max(0, stars - 1) * STAR_XP;
            else {
                const prevStars = rec.previousBest ? rec.previousBest.bestStars : 0;
                if (stars > prevStars) xpGained += (stars - prevStars) * STAR_XP;
            }
        }
        // 2) 每日挑战：每天第一次完成
        if (ev.mode === 'daily' && ev.dateKey && this.once(`d:${ev.dateKey}`)) {
            xpGained += DAILY_CHALLENGE_XP;
            p.stats.dailyChallenges++;
        }
        // 3) 统计
        p.stats.puzzlesCompleted++;
        if (stars === 3) p.stats.threeStars++;

        // 4) 每日任务
        const missions: GoalProgress[] = [];
        for (const it of p.missions.items) {
            const def = getMission(it.id);
            if (!def || it.progress >= def.target) continue;
            const before = it.progress;
            if (this.missionMatches(def, ev, stars)) it.progress = Math.min(def.target, it.progress + 1);
            if (it.progress !== before) missions.push({ id: def.id, title: def.title, progress: it.progress, target: def.target, xp: def.xp, justCompleted: it.progress >= def.target });
        }
        let missionsAllDone = false;
        if (!p.missions.counted && p.missions.items.length && p.missions.items.every((it) => it.progress >= (getMission(it.id)?.target || 1))) {
            p.missions.counted = true;
            p.stats.missionDays++;
            missionsAllDone = true;
        }

        // 5) 每周挑战
        const weekly = generateWeekly(p.weekly.weekKey);
        const weeklyProg: GoalProgress[] = [];
        for (const it of p.weekly.items) {
            const def = weekly.objectives.find((o) => o.id === it.id);
            if (!def || it.progress >= def.target) continue;
            const before = it.progress;
            const hit = def.kind === 'complete' || (def.kind === 'theme' && weekly.theme.items.indexOf(result.imageId) >= 0) || (def.kind === 'three_star' && stars === 3);
            if (hit) it.progress = Math.min(def.target, it.progress + 1);
            if (it.progress !== before) weeklyProg.push({ id: def.id, title: def.title, progress: it.progress, target: def.target, xp: def.xp, justCompleted: it.progress >= def.target });
        }
        let weeklyCompleted = false;
        if (!p.weekly.completed && p.weekly.items.every((it) => it.progress >= (weekly.objectives.find((o) => o.id === it.id)?.target || 1))) {
            p.weekly.completed = true;
            p.stats.weeklyCompleted++;
            p.weeklyHistory.push({ weekKey: p.weekly.weekKey, theme: weekly.theme.id, completedAt: this.now() });
            if (p.weeklyHistory.length > 26) p.weeklyHistory.splice(0, p.weeklyHistory.length - 26);
            weeklyCompleted = true;
        }

        const lv = this.grantXp(xpGained);
        const achievements = this.checkAchievements();
        this.save.mutate(() => undefined, true);
        return { xpGained, levelBefore: lv.before, levelAfter: lv.after, leveledUp: lv.after > lv.before, newTitle: lv.title, missions, missionsAllDone, weekly: weeklyProg, weeklyCompleted, achievements };
    }

    private missionMatches(def: MissionDef, ev: PuzzleEvent, stars: number): boolean {
        switch (def.kind) {
            case 'complete':
                return true;
            case 'three_star':
                return stars === 3;
            case 'collect_new':
                return ev.rec.newlyCollected;
            case 'daily_challenge':
                return ev.mode === 'daily';
            case 'no_hint':
                return ev.result.hintsUsed === 0;
            case 'grid4plus':
                return ev.result.grid >= 4;
        }
    }

    /** 好友挑战完成（每个挑战码只记一次） */
    onFriendChallengeCompleted(code: string, win: boolean): ProgressUpdate | null {
        this.refresh();
        if (!this.once(`f:${code}`)) return null;
        const p = this.p;
        p.stats.friendChallenges++;
        let xp = FRIEND_CHALLENGE_XP;
        if (win) {
            p.stats.friendWins++;
            xp += FRIEND_WIN_XP;
        }
        const lv = this.grantXp(xp);
        const achievements = this.checkAchievements();
        this.save.mutate(() => undefined, true);
        return { xpGained: xp, levelBefore: lv.before, levelAfter: lv.after, leveledUp: lv.after > lv.before, newTitle: lv.title, missions: [], missionsAllDone: false, weekly: [], weeklyCompleted: false, achievements };
    }

    // ------------------------------------------------------------ 成就

    achievementStats(): AchievementStats {
        const o = this.collection.overall();
        return { ...this.p.stats, collectedCount: o.collected, seriesDone: o.seriesDone, extremeCleared: this.collection.extremeClearedCount() };
    }

    /** 检查并解锁达成条件的成就（只解锁一次），返回本次新解锁的 */
    checkAchievements(): AchievementDef[] {
        const stats = this.achievementStats();
        const fresh: AchievementDef[] = [];
        for (const a of ACHIEVEMENTS) {
            if (this.p.achievements[a.id]) continue;
            if (a.value(stats) >= a.target) {
                this.p.achievements[a.id] = { at: this.now(), claimed: false };
                fresh.push(a);
            }
        }
        return fresh;
    }

    // ------------------------------------------------------------ 视图

    missionsView(): { dateKey: string; items: MissionItemView[]; bonusXp: number; bonusReady: boolean; bonusClaimed: boolean; doneCount: number } {
        this.refresh();
        const items: MissionItemView[] = [];
        for (const it of this.p.missions.items) {
            const def = getMission(it.id);
            if (def) items.push({ def, progress: it.progress, done: it.progress >= def.target, claimed: it.claimed });
        }
        const doneCount = items.filter((i) => i.done).length;
        return { dateKey: this.p.missions.dateKey, items, bonusXp: MISSION_BONUS_XP, bonusReady: items.length > 0 && doneCount === items.length && !this.p.missions.bonusClaimed, bonusClaimed: this.p.missions.bonusClaimed, doneCount };
    }

    weeklyView(): { challenge: WeeklyChallenge; items: WeeklyItemView[]; completed: boolean; completeClaimed: boolean; completeXp: number; doneCount: number; history: Array<{ weekKey: string; theme: string; completedAt: number }> } {
        this.refresh();
        const challenge = generateWeekly(this.p.weekly.weekKey);
        const items: WeeklyItemView[] = challenge.objectives.map((o) => {
            const st = this.p.weekly.items.find((i) => i.id === o.id) as GoalState;
            return { id: o.id, title: o.title, xp: o.xp, target: o.target, progress: st ? st.progress : 0, done: !!st && st.progress >= o.target, claimed: !!st && st.claimed };
        });
        return { challenge, items, completed: this.p.weekly.completed, completeClaimed: this.p.weekly.completeClaimed, completeXp: WEEKLY_COMPLETE_XP, doneCount: items.filter((i) => i.done).length, history: this.p.weeklyHistory.slice().reverse() };
    }

    achievementsView(): AchievementView[] {
        const stats = this.achievementStats();
        return ACHIEVEMENTS.map((def) => {
            const st = this.p.achievements[def.id];
            return { def, progress: Math.min(def.target, def.value(stats)), unlocked: !!st, claimed: !!st && st.claimed, at: st ? st.at : 0 };
        });
    }

    /** 可领取的奖励数量（红点） */
    claimableCount(): number {
        const m = this.missionsView();
        let n = m.items.filter((i) => i.done && !i.claimed).length + (m.bonusReady ? 1 : 0);
        const w = this.weeklyView();
        n += w.items.filter((i) => i.done && !i.claimed).length + (w.completed && !w.completeClaimed ? 1 : 0);
        n += this.achievementsView().filter((a) => a.unlocked && !a.claimed).length;
        return n;
    }

    // ------------------------------------------------------------ 领取

    private claimed(xp: number): ClaimResult {
        const lv = this.grantXp(xp);
        this.save.mutate(() => undefined, true);
        return { ok: true, xp, levelBefore: lv.before, levelAfter: lv.after, newTitle: lv.title };
    }

    private fail(): ClaimResult {
        const l = this.level().level;
        return { ok: false, xp: 0, levelBefore: l, levelAfter: l, newTitle: null };
    }

    claimMission(id: string): ClaimResult {
        this.refresh();
        const it = this.p.missions.items.find((i) => i.id === id);
        const def = getMission(id);
        if (!it || !def || it.claimed || it.progress < def.target) return this.fail();
        it.claimed = true;
        return this.claimed(def.xp);
    }

    claimMissionBonus(): ClaimResult {
        const v = this.missionsView();
        if (!v.bonusReady) return this.fail();
        this.p.missions.bonusClaimed = true;
        return this.claimed(MISSION_BONUS_XP);
    }

    claimWeekly(id: string): ClaimResult {
        this.refresh();
        const v = this.weeklyView().items.find((i) => i.id === id);
        const it = this.p.weekly.items.find((i) => i.id === id);
        if (!v || !it || !v.done || it.claimed) return this.fail();
        it.claimed = true;
        return this.claimed(v.xp);
    }

    claimWeeklyComplete(): ClaimResult {
        this.refresh();
        if (!this.p.weekly.completed || this.p.weekly.completeClaimed) return this.fail();
        this.p.weekly.completeClaimed = true;
        return this.claimed(WEEKLY_COMPLETE_XP);
    }

    claimAchievement(id: string): ClaimResult {
        const st = this.p.achievements[id];
        const def = getAchievement(id);
        if (!st || !def || st.claimed) return this.fail();
        st.claimed = true;
        return this.claimed(def.xp);
    }

    // ------------------------------------------------------------ 推荐下一步

    /**
     * 结算页的“下一步”建议。优先级：只差最后一件且已能玩的系列 > 未完成的每日挑战 >
     * 最接近完成的任务 > 周挑战 > 继续经典拼图。每次只给一条，避免信息过载。
     */
    recommendNext(dailyDone: boolean): NextStep {
        const next = this.collection.nextRewardSeries();
        if (next) {
            const fin = this.collection.finalItem(next.info.id);
            if (fin && fin.playable) return { kind: 'series', text: `再收集「${fin.art.name}」就能集齐${next.info.name}系列，领取奖励`, seriesId: next.info.id };
        }
        if (!dailyDone) return { kind: 'daily', text: '今天的每日挑战还没完成，去试试吧' };
        const m = this.missionsView();
        const open = m.items.filter((i) => !i.done).sort((a, b) => b.progress / b.def.target - a.progress / a.def.target)[0];
        if (open) return { kind: 'mission', text: `今日任务：${open.def.title}（${open.progress}/${open.def.target}）` };
        const w = this.weeklyView();
        const wo = w.items.find((i) => !i.done);
        if (wo) return { kind: 'weekly', text: `本周挑战：${wo.title}（${wo.progress}/${wo.target}）` };
        if (next) return { kind: 'series', text: `收集${next.info.name}系列还差 ${next.remaining} 件`, seriesId: next.info.id };
        return { kind: 'classic', text: '来一局新的拼图，挑战更快的成绩' };
    }
}
