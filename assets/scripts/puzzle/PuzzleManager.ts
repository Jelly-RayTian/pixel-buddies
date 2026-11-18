import { DIFFICULTIES, EXTREME, GAMEPLAY } from '../config/GameConfig';
import { GameTimer, Clock, defaultClock } from '../core/GameTimer';
import { buildPieces, generateLayout, PieceData, PuzzleLayout, PuzzleSpec } from './PuzzleGenerator';
import { PuzzleResult } from './PuzzleScoring';
import { countCorrect, isPermutation, isSolved, minSwapsToSolve } from './PuzzleValidator';

export interface SwapOutcome {
    /** 是否真的发生了交换 */
    swapped: boolean;
    /** 本次交换后新归位的格子 */
    newlyCorrectCells: number[];
    solved: boolean;
    reason?: 'same-cell' | 'locked' | 'out-of-range' | 'finished';
}

/** 一局的规则（默认 = 普通模式） */
export interface PuzzleRules {
    /** 拼对的方块是否锁定；默认跟随 GAMEPLAY.lockCorrectPieces，地狱模式为 false */
    lockCorrect?: boolean;
    /** 是否允许使用提示；地狱模式为 false */
    hints?: boolean;
    /**
     * looks[pieceId] = 长相编号（见 tileLooks）。提供时，按长相判断格子是否拼对：
     * 长得一模一样的两块互换后画面不变，也算拼好。
     */
    looks?: readonly number[];
}

export interface HintInfo {
    /** 需要移动的方块当前所在格 */
    fromCell: number;
    /** 它应该去的格子 */
    toCell: number;
}

/**
 * 一局拼图的会话控制器（纯逻辑，不依赖 cc、不调用任何平台 API）。
 * 视图层（PuzzleBoard）只负责把玩家操作翻译成 trySwap/useHint/undo，并根据返回值播放动画。
 */
export class PuzzleManager {
    readonly spec: PuzzleSpec;
    readonly layout: PuzzleLayout;
    readonly n: number;
    readonly timer: GameTimer;
    readonly optimalMoves: number;

    /** order[cell] = pieceId */
    private order: number[];
    private _moves = 0;
    private _hintsUsed = 0;
    private _peekCount = 0;
    private _undoCount = 0;
    private _bonusHints = 0;
    private _finished = false;
    private undoStack: Array<[number, number]> = [];
    private readonly lockCorrect: boolean;
    private readonly hintsAllowed: boolean;
    private readonly looks: readonly number[] | null;

    /** @param fixedCells 不参与打乱的格子（与其他格子长得一模一样的方块），见 identicalTileCells */
    constructor(spec: PuzzleSpec, clock: Clock = defaultClock, fixedCells: readonly number[] = [], rules: PuzzleRules = {}) {
        this.spec = spec;
        this.lockCorrect = rules.lockCorrect ?? GAMEPLAY.lockCorrectPieces;
        this.hintsAllowed = rules.hints ?? true;
        this.looks = rules.looks && rules.looks.length === spec.grid * spec.grid ? rules.looks : null;
        this.layout = generateLayout(spec, fixedCells);
        this.n = spec.grid * spec.grid;
        this.order = this.layout.order.slice();
        this.optimalMoves = minSwapsToSolve(this.order);
        this.timer = new GameTimer(clock);
    }

    get grid(): number {
        return this.spec.grid;
    }
    get moves(): number {
        return this._moves;
    }
    get hintsUsed(): number {
        return this._hintsUsed;
    }
    get hintsLeft(): number {
        if (!this.hintsAllowed) return 0;
        const free = this.spec.extreme ? EXTREME.freeHints : DIFFICULTIES[this.spec.grid].freeHints;
        return Math.max(0, free + this._bonusHints - this._hintsUsed);
    }
    get peekCount(): number {
        return this._peekCount;
    }
    get extreme(): boolean {
        return !!this.spec.extreme;
    }
    /** 还能“按住看原图”几次；普通模式不限次数（Infinity） */
    get peeksLeft(): number {
        return this.spec.extreme ? Math.max(0, EXTREME.maxPeeks - this._peekCount) : Infinity;
    }
    get finished(): boolean {
        return this._finished;
    }
    get correctCount(): number {
        if (!this.looks) return countCorrect(this.order);
        let k = 0;
        for (let c = 0; c < this.n; c++) if (this.isCellCorrect(c)) k++;
        return k;
    }

    /** 是否允许使用提示（地狱模式不允许） */
    get hintsEnabled(): boolean {
        return this.hintsAllowed;
    }
    get canUndo(): boolean {
        return !this._finished && this.undoStack.length > 0;
    }

    pieceAt(cell: number): number {
        return this.order[cell];
    }

    isCellCorrect(cell: number): boolean {
        const piece = this.order[cell];
        if (piece === cell) return true;
        return !!this.looks && this.looks[piece] === this.looks[cell];
    }

    /** 当前所有方块数据快照 */
    getPieces(): PieceData[] {
        return buildPieces({ ...this.layout, order: this.order });
    }

    /** 方块是否可被拿起（已归位的方块在配置开启时锁定） */
    canPick(cell: number): boolean {
        if (this._finished || cell < 0 || cell >= this.n) return false;
        return !(this.lockCorrect && this.isCellCorrect(cell));
    }

    /** 玩家第一次有效操作（拿起方块/点选方块）时调用，开始计时 */
    notifyInteraction(): void {
        if (!this._finished) this.timer.start();
    }

    trySwap(a: number, b: number): SwapOutcome {
        const none: SwapOutcome = { swapped: false, newlyCorrectCells: [], solved: this._finished };
        if (this._finished) return { ...none, reason: 'finished' };
        if (a < 0 || b < 0 || a >= this.n || b >= this.n) return { ...none, reason: 'out-of-range' };
        if (a === b) return { ...none, reason: 'same-cell' };
        if (!this.canPick(a) || (this.lockCorrect && this.isCellCorrect(b))) return { ...none, reason: 'locked' };

        this.timer.start();
        this.swapRaw(a, b);
        this._moves++;
        this.undoStack.push([a, b]);
        if (this.undoStack.length > GAMEPLAY.maxUndoDepth) this.undoStack.shift();

        const newly: number[] = [];
        if (this.isCellCorrect(a)) newly.push(a);
        if (this.isCellCorrect(b)) newly.push(b);

        const solved = this.looks ? this.correctCount === this.n : isSolved(this.order);
        if (solved) {
            this._finished = true;
            this.timer.stop();
            this.undoStack.length = 0;
        }
        return { swapped: true, newlyCorrectCells: newly, solved };
    }

    /** 撤销上一步交换：不计入步数，但记录撤销次数。返回被撤销的两个格子 */
    undo(): [number, number] | null {
        if (!this.canUndo) return null;
        const last = this.undoStack.pop()!;
        this.swapRaw(last[0], last[1]);
        this._undoCount++;
        return last;
    }

    /**
     * 定位提示：选择一个未归位的方块，返回它当前所在格与正确格。
     * 优先选择“一次交换即可让两块同时归位”的组合，体验更好。
     */
    useHint(): HintInfo | null {
        if (this._finished || this.hintsLeft <= 0) return null;
        const pick = this.peekHint();
        if (pick) {
            this._hintsUsed++;
            this.timer.start();
        }
        return pick;
    }

    /**
     * 查找一个有效的交换建议，但不消耗提示次数、不启动计时（教程和引导使用）。
     * 优先“一次交换让两块同时归位”的组合。
     */
    peekHint(): HintInfo | null {
        if (this._finished) return null;
        let pick: HintInfo | null = null;
        for (let cell = 0; cell < this.n; cell++) {
            const piece = this.order[cell];
            if (piece !== cell && this.order[piece] === cell) {
                pick = { fromCell: cell, toCell: piece };
                break;
            }
        }
        if (!pick) {
            for (let cell = 0; cell < this.n; cell++) {
                const piece = this.order[cell];
                if (piece !== cell) {
                    pick = { fromCell: cell, toCell: piece };
                    break;
                }
            }
        }
        return pick;
    }

    /** 激励视频完整观看后发放 1 次额外提示（仅本局有效） */
    grantExtraHint(count = 1): void {
        if (!this._finished && count > 0) this._bonusHints += count;
    }

    /** 查看原图（不影响星级，单独计数） */
    recordPeek(): void {
        this._peekCount++;
    }

    pause(): void {
        this.timer.pause();
    }

    resume(): void {
        this.timer.resume();
    }

    getResult(): PuzzleResult {
        return {
            imageId: this.spec.imageId,
            grid: this.spec.grid,
            seed: this.spec.seed,
            timeMs: this.timer.elapsedMs,
            moves: this._moves,
            hintsUsed: this._hintsUsed,
            peekCount: this._peekCount,
            undoCount: this._undoCount,
            optimalMoves: this.optimalMoves,
            extreme: this.spec.extreme ? true : undefined,
        };
    }

    /** 自检：布局始终是合法排列（调试/测试用） */
    selfCheck(): boolean {
        return isPermutation(this.order, this.n);
    }

    private swapRaw(a: number, b: number): void {
        const t = this.order[a];
        this.order[a] = this.order[b];
        this.order[b] = t;
    }
}
