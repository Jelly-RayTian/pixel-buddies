import { BlockInputEvents, Graphics, Label, Node, Sprite, tween, Tween, UITransform, Vec3 } from 'cc';
import { P } from '../art/Palette';
import { CHALLENGE, DIFFICULTIES, EXTREME, HELL } from '../config/GameConfig';
import { formatDuration } from '../core/GameTimer';
import { PlaySession, ResultPayload } from '../core/GameManager';
import { PuzzleBoard } from '../puzzle/PuzzleBoard';
import { BEGINNER_GRID } from '../config/GameConfig';
import { identicalTileCells, tileLooks } from '../puzzle/TileSignature';
import { PuzzleManager, SwapOutcome } from '../puzzle/PuzzleManager';
import { computeStars, movesHudText } from '../puzzle/PuzzleScoring';
import { Effects } from '../ui/Effects';
import { hex, Theme } from '../ui/Theme';
import { Ticker } from '../ui/Ticker';
import { artFrame } from './PageKit';
import { button, ButtonHandle, label, makeNode, onTap, opacityOf, panel, sprite } from '../ui/UIKit';
import { BasePage } from './BasePage';

const MODE_TAG: Record<PlaySession['mode'], string> = {
    classic: '经典',
    daily: '每日挑战',
    'challenge-create': '发起挑战',
    'challenge-accept': '好友挑战',
    hell: '地狱模式',
};

/**
 * 游戏进行页：HUD（时间/步数与当前星级步数上限/三星剩余时间/进度）+ 拼图板 + 工具栏（原图/提示/撤销）。
 * 计时从第一次触碰有效方块开始；暂停、进入后台都会冻结计时。
 */
export class GamePage extends BasePage {
    private board!: PuzzleBoard;
    private pm: PuzzleManager | null = null;
    private session: PlaySession | null = null;
    private titleLabel!: Label;
    private tagLabel!: Label;
    private timeLabel!: Label;
    private movesLabel!: Label;
    private goalLabel!: Label;
    private progressLabel!: Label;
    private progressBar!: Graphics;
    private progressW = 0;
    private progressNode!: Node;
    /** 本局是否地狱模式：拼对无反馈、不锁定、无提示、不显示限制 */
    private hell = false;
    private hintBtn!: ButtonHandle;
    private undoBtn!: ButtonHandle;
    private peekBtn!: ButtonHandle;
    private fx!: Effects;
    private lastShownSecond = -1;
    private paused = false;
    private finishing = false;
    private refSprite!: Sprite;
    private refTagLabel!: Label;
    private zoomTagLabel!: Label;
    private fxLayer!: Node;
    private refRect = { x: 0, y: 0, w: 0, h: 0 };
    private boardRect = { x: 0, y: 0, w: 0, h: 0 };
    /** 教程状态：step 1 看目标 / 2 认识交换 / 3 亲手试 / 4 庆祝 */
    private tut: { step: 1 | 2 | 3 | 4; pair: [number, number] } | null = null;
    private tutLayer: Node | null = null;
    private tutBody: Label | null = null;
    private tutCard: Node | null = null;
    private tutAfter: (() => void) | null = null;

    protected build(): void {
        const L = this.L;
        const gm = this.gm;
        const W = L.w - Theme.gutter * 2;

        // 头部：暂停 + 标题
        button(this.root, { w: 84, h: 72, style: 'white', icon: gm.textures.icon('pause', P.ink), iconSize: 26, onClick: () => !this.tutLocked() && this.openPause() }, -L.w / 2 + Theme.gutter + 42, L.headerY);
        this.titleLabel = label(this.root, '', Theme.font.h2, { bold: true, width: 360 });
        this.titleLabel.node.setPosition(0, L.headerY + 14);
        this.tagLabel = label(this.root, '', Theme.font.tiny, { color: Theme.textMuted, width: 360 });
        this.tagLabel.node.setPosition(0, L.headerY - 22);

        // 顶部信息区：左边“目标图片”（常驻），右边 时间 / 步数 / 三星倒计时
        // 纵向自适应：棋盘受宽度限制，高屏多出的空间平分到信息区上下，避免棋盘上下大块留白
        const TB = 156;
        const toolY = -L.h / 2 + L.safeBottom + 24 + 56;
        const progY = toolY + 52 + 44;
        const baseTop = L.contentTop - 24;
        const baseAreaTop = baseTop - TB - 30;
        const spare = Math.max(0, baseAreaTop - (progY + 48) - (W + 8));
        const tbY = baseTop - TB / 2 - spare * 0.3;

        const refX = -W / 2 + TB / 2;
        const refFrame = artFrame(this.root, gm.textures.art('cat_orange'), TB - 20, refX, tbY, 'pink');
        this.refSprite = refFrame.getComponentInChildren(Sprite)!;
        this.refRect = { x: refX, y: tbY, w: TB, h: TB };
        const refTag = panel(this.root, 124, 34, { fill: P.rose, border: P.ink, shadow: undefined, step: 3 }, refX, tbY + TB / 2 + 6);
        this.refTagLabel = label(refTag, '目标图片', Theme.font.tiny, { bold: true, color: P.white });
        const zoomTag = panel(this.root, 124, 30, { fill: P.white, border: P.ink, shadow: undefined, step: 3 }, refX, tbY - TB / 2 - 6);
        this.zoomTagLabel = label(zoomTag, '点击放大', Theme.font.tiny - 2, { bold: true, color: P.ink2 });
        onTap(refFrame, () => this.openReference());

        const sx = refX + TB / 2 + 24;
        const sw = W / 2 - sx;
        const rowH = 46, rowGap = (TB - rowH * 3) / 2;
        const mk = (i: number, icon: string, color: number, fill: number) => {
            const y = tbY + TB / 2 - rowH / 2 - i * (rowH + rowGap);
            const p = panel(this.root, sw, rowH, { fill, border: P.ink, shadow: P.ink, step: Theme.px, shadowDepth: 1 }, sx + sw / 2, y);
            sprite(p, gm.textures.icon(icon, color, P.white), 24, 24, -sw / 2 + 30, 0);
            const l = label(p, '', Theme.font.small, { bold: true, width: sw - 80 });
            l.node.setPosition(18, 0);
            return l;
        };
        this.timeLabel = mk(0, 'clock', P.blue3, P.sky);
        this.movesLabel = mk(1, 'steps', P.leaf3, P.mint);
        this.goalLabel = mk(2, 'star', P.gold2, P.butter);
        this.goalLabel.fontSize = Theme.font.small - 2;

        // 工具栏
        const tw = (W - 32) / 3;
        this.peekBtn = button(this.root, { w: tw, h: 104, text: '按住看原图', fontSize: Theme.font.small, style: 'sky', icon: gm.textures.icon('eye', P.blue3, P.white), iconSize: 40, iconTop: true }, -W / 2 + tw / 2, toolY);
        this.hintBtn = button(this.root, { w: tw, h: 104, text: '提示', fontSize: Theme.font.small, style: 'butter', icon: gm.textures.icon('bulb', P.gold2, P.white), iconSize: 40, iconTop: true, onClick: () => this.useHint() }, 0, toolY);
        this.undoBtn = button(this.root, { w: tw, h: 104, text: '撤销', fontSize: Theme.font.small, style: 'lilac', icon: gm.textures.icon('undo', P.purple2, P.white), iconSize: 40, iconTop: true, onClick: () => this.undo() }, W / 2 - tw / 2, toolY);
        // 原图：按住显示，松开隐藏
        this.peekBtn.node.on(Node.EventType.TOUCH_START, () => this.setPeek(true));
        this.peekBtn.node.on(Node.EventType.TOUCH_END, () => this.setPeek(false));
        this.peekBtn.node.on(Node.EventType.TOUCH_CANCEL, () => this.setPeek(false));

        // 进度条（工具栏上方）
        this.progressW = W;
        this.progressLabel = label(this.root, '', Theme.font.tiny, { color: P.ink2, bold: true, align: 'left' });
        this.progressLabel.node.setPosition(-W / 2, progY + 22);
        const bar = makeNode('Progress', this.root, W, 16, 0, progY);
        this.progressNode = bar;
        this.progressBar = bar.addComponent(Graphics);

        // 棋盘：在 HUD 与进度条之间取最大正方形
        const areaTop = baseAreaTop - spare * 0.3;
        const areaBottom = progY + 48;
        const boardSize = Math.min(W + 8, areaTop - areaBottom);
        this.board = new PuzzleBoard(this.root, boardSize, gm.textures, {
            onFirstTouch: () => this.pm && this.pm.notifyInteraction(),
            onPick: () => gm.audio.play('pick', 0.6),
            onSwap: (o, a, b) => this.onSwap(o, a, b),
            onLockedTouch: () => gm.audio.play('error', 0.5),
            onRestricted: () => this.onTutorialMistake(),
        });
        const boardY = (areaTop + areaBottom) / 2;
        this.board.node.setPosition(0, boardY);
        this.boardRect = { x: 0, y: boardY, w: boardSize, h: boardSize };

        this.fxLayer = makeNode('Fx', this.root, L.w, L.h);
        this.fx = new Effects(this.fxLayer);

        const ticker = this.root.addComponent(Ticker);
        ticker.cb = () => this.tick();
    }

    onEnter(session: PlaySession): void {
        if (!session) return;
        const gm = this.gm;
        this.session = session;
        this.paused = false;
        this.finishing = false;
        this.lastShownSecond = -1;
        // 长得一模一样的方块不参与打乱，避免“看起来拼好了却没完成”
        // 旧版本发出的好友挑战（v1）按旧规则打乱，保证和发起方是同一个局面
        const legacy = !!session.challenge && session.challenge.version < CHALLENGE.identicalTilesFromVersion;
        const canvas = gm.textures.artCanvas(session.spec.imageId);
        const fixed = legacy ? [] : identicalTileCells(canvas.data, canvas.w, session.spec.grid);
        this.hell = session.mode === 'hell';
        // 地狱模式：拼对不锁定、不给提示；按长相判断是否拼好（两块一模一样的方块互换也算对）
        const ex = !!session.spec.extreme;
        const rules = this.hell ? { lockCorrect: false, hints: false, looks: tileLooks(canvas.data, canvas.w, session.spec.grid) } : ex ? { looks: tileLooks(canvas.data, canvas.w, session.spec.grid) } : {};
        this.pm = new PuzzleManager(session.spec, undefined, fixed, rules);
        this.board.setTheme(gm.shop.boardTheme());
        this.board.start(this.pm);
        this.board.setEnabled(true);
        const art = this.gm.resolveArt(session.spec.imageId);
        this.titleLabel.string = art ? art.name : '像素拼图';
        const d = DIFFICULTIES[session.spec.grid];
        this.tagLabel.string = this.hell ? `${MODE_TAG.hell} · ${session.spec.grid}×${session.spec.grid} ${HELL.desc}` : ex ? `${MODE_TAG[session.mode]} · ${EXTREME.label}模式 ${EXTREME.desc}` : `${MODE_TAG[session.mode]} · ${d.label} ${d.desc}`;
        // 极限模式：目标图隐藏，只能靠“按住看原图”偷看有限次数
        this.refSprite.node.active = !ex;
        this.refTagLabel.string = ex ? '目标已隐藏' : '目标图片';
        this.zoomTagLabel.string = ex ? `偷看 ${EXTREME.maxPeeks} 次` : '点击放大';
        this.progressNode.active = !this.hell;
        this.hintBtn.setEnabled(!this.hell);
        const firstEver = gm.save.data.totalPlays === 0;
        gm.collection.recordPlayStarted();
        if (firstEver) gm.analytics.track('first_game_started', { mode: session.mode, grid: session.spec.grid });
        if (session.mode === 'daily') gm.analytics.track('daily_challenge_started', { grid: session.spec.grid });
        // 同一张作品已经收藏过：算“重玩”（用于判断收藏系统是否带来复玩）
        if (gm.collection.isCollected(session.spec.imageId)) gm.analytics.track('puzzle_replayed', { image: session.spec.imageId, grid: session.spec.grid, mode: session.mode });
        gm.analytics.track('puzzle_started', { mode: session.mode, image: session.spec.imageId, grid: session.spec.grid });
        this.refSprite.spriteFrame = gm.textures.art(session.spec.imageId);
        this.refreshHud(true);
        // 教程：只在玩家还没学过时出现，且只出现在入门拼图或玩家的第一局
        const first = gm.save.data.totalCompletions === 0;
        if (!this.hell && !gm.save.data.tutorial.puzzleBasics && (session.spec.grid === BEGINNER_GRID || first)) this.startTutorial();
    }

    onExit(): void {
        // 没做完就离开（点返回/回首页）：记一次“放弃”，用于判断难度和卡点
        if (this.pm && this.session && !this.pm.finished && !this.finishing) {
            this.gm.analytics.track('puzzle_abandoned', { mode: this.session.mode, grid: this.session.spec.grid, time: Math.round(this.pm.getResult().timeMs / 1000), moves: this.pm.moves });
        }
        this.setPeek(false);
        this.closeTutorial(false);
        this.sm.closeAllModals();
        // 离开时归还方块到对象池；作品纹理保留（收藏册等仍会用到）
        this.board.clear();
        this.gm.textures.releasePrefix('piece:');
        this.pm = null;
    }

    onBack(): boolean {
        if (this.pm && !this.pm.finished) {
            this.openPause();
            return true;
        }
        return false;
    }

    onAppHide(): void {
        // 进入后台：冻结计时并弹出暂停面板，回来时由玩家主动继续
        if (this.pm && !this.pm.finished && !this.paused) this.openPause();
    }

    // ------------------------------------------------------------ 操作

    /** 教程第 3 步期间，其它按钮暂时不可用（避免玩家误触而打断教程） */
    private tutLocked(): boolean {
        if (!this.tut) return false;
        this.sm.toast('先完成教程里的交换吧，或点“跳过教程”', 1.4);
        return true;
    }

    private onSwap(o: SwapOutcome, a: number, b: number): void {
        const gm = this.gm;
        gm.audio.play('swap', 0.6);
        // 地狱模式：拼对没有任何提示（无音效、无震动、无闪光），只有全部拼完才结算
        if (o.newlyCorrectCells.length && !this.hell) {
            this.scheduleCall(0.14, () => gm.audio.play('correct', 0.7));
            gm.vibrate();
            for (const c of o.newlyCorrectCells) {
                const p = this.board.celebrateCell(c);
                const bp = this.board.node.position;
                this.scheduleCall(0.16, () => this.fx.burst(bp.x + p.x, bp.y + p.y, 6));
            }
        }
        this.refreshHud(true);
        if (this.tut && this.tut.step === 3) this.completeTutorialMove();
        if (o.solved) this.finish();
    }

    private useHint(): void {
        const gm = this.gm;
        if (!this.pm || this.pm.finished || this.tutLocked()) return;
        if (!this.pm.hintsEnabled) {
            this.sm.toast('地狱模式没有提示，靠自己吧');
            return;
        }
        if (this.pm.hintsLeft <= 0) {
            // 提示券：升级礼物和兑换所里换来的；极限模式明确写了“提示仅 1 次”，不能用券
            const tokens = gm.shop.hintTokens();
            if (tokens > 0 && !this.pm.extreme) {
                this.sm.confirm('提示用完啦', `用 1 张提示券换 1 次提示？（剩 ${tokens} 张；用提示会限制本局最高星级）`, [
                    { text: '不用了', style: 'secondary' },
                    { text: '用提示券', style: 'primary', onClick: () => this.useToken() },
                ]);
                return;
            }
            if (this.pm.extreme && tokens > 0) {
                this.sm.toast('极限模式只有 1 次提示，不能用提示券');
                return;
            }
            if (gm.ads.isRewardedAvailable()) {
                this.sm.confirm('提示用完啦', '观看一段激励视频，可获得 1 次额外提示（不看也不影响继续游戏）。', [
                    { text: '不用了', style: 'secondary' },
                    { text: '看视频', style: 'primary', onClick: () => this.rewardHint() },
                ]);
            } else {
                this.sm.toast('本局免费提示已用完，试试“按住看原图”吧');
            }
            return;
        }
        const h = this.pm.useHint();
        if (!h) return;
        gm.audio.play('pick', 0.7);
        this.board.showHint(h.fromCell, h.toCell);
        gm.analytics.track('hint_used', { left: this.pm.hintsLeft });
        this.refreshHud(true);
    }

    /** 用 1 张提示券换 1 次提示并立刻使用 */
    private useToken(): void {
        if (!this.pm || this.pm.finished) return;
        if (!this.gm.shop.useHintToken()) {
            this.sm.toast('没有提示券了');
            return;
        }
        this.pm.grantExtraHint(1);
        this.gm.analytics.track('hint_token_used', { left: this.gm.shop.hintTokens() });
        this.useHint();
    }

    /** 激励视频换提示（仅在广告真实接入且玩家主动选择时调用） */
    private rewardHint(): void {
        this.pauseTimer(true);
        this.gm.ads.showRewarded('extra_hint').then((r) => {
            this.pauseTimer(false);
            this.sm.toast(r.message);
            if (r.status === 'rewarded' && this.pm) {
                this.pm.grantExtraHint(1);
                this.refreshHud(true);
            }
        });
    }

    private undo(): void {
        if (!this.pm || this.tutLocked()) return;
        const r = this.pm.undo();
        if (!r) {
            this.sm.toast('没有可以撤销的操作');
            return;
        }
        this.gm.audio.play('swap', 0.5);
        this.board.resetGuide();
        this.board.applyVisualSwap(r[0], r[1], 0.18);
        this.refreshHud(true);
    }

    private setPeek(show: boolean): void {
        if (!this.pm || this.pm.finished || (show && this.tut)) {
            this.board.setPeek(false);
            return;
        }
        if (show) {
            if (this.pm.peeksLeft <= 0) {
                this.sm.toast('极限模式的偷看次数用完了');
                this.board.setPeek(false);
                return;
            }
            this.pm.recordPeek();
            this.refreshHud(true);
        }
        this.board.setPeek(show);
    }

    private pauseTimer(p: boolean): void {
        if (!this.pm) return;
        if (p) this.pm.pause();
        else this.pm.resume();
    }

    private openPause(): void {
        if (!this.pm || this.pm.finished || this.paused) return;

        this.paused = true;
        this.pauseTimer(true);
        this.refreshHud(true);
        this.board.setEnabled(false);
        const w = Math.min(this.L.w - 80, 560);
        const h = 560;
        const card = this.sm.openModal(w, h, { closeOnMask: false, onClose: () => this.resumeFromPause() });
        const t = label(card, '休息一下', Theme.font.title, { bold: true });
        t.node.setPosition(0, h / 2 - 70);
        const infoText = this.hell ? '地狱模式不限时、不限步\n拼完才结算' : `已用时 ${formatDuration(this.pm.timer.elapsedMs)} · ${this.pm.moves} 步\n计时已暂停`;
        const info = label(card, infoText, Theme.font.small, { color: P.ink2, width: w - 60, wrap: true });
        info.node.setPosition(0, h / 2 - 140);
        button(card, { w: w - 100, h: 96, text: '继续拼图', style: 'primary', icon: this.gm.textures.icon('play', P.white), onClick: () => this.sm.closeModal() }, 0, 10);
        button(card, { w: w - 100, h: 88, text: '重新开始', style: 'secondary', icon: this.gm.textures.icon('refresh', P.ink), onClick: () => this.restart() }, 0, -100);
        button(card, { w: w - 100, h: 88, text: '返回首页', style: 'ghost', onClick: () => this.quit() }, 0, -200);
    }

    private resumeFromPause(): void {
        this.paused = false;
        if (this.pm && !this.pm.finished) {
            this.pauseTimer(false);
            // 教程第 1、2、4 步棋盘不可操作，只有第 3 步（或没有教程）才恢复
            if (!this.tut || this.tut.step === 3) this.board.setEnabled(true);
        }
    }

    private restart(): void {
        if (!this.session) return;
        this.sm.closeAllModals();
        this.paused = false;
        const s = this.session;
        this.board.clear();
        // 经典模式重新打乱；每日/挑战模式必须保持同一道题
        const spec = s.mode === 'classic' || s.mode === 'hell' ? { ...s.spec, seed: (Math.random() * 0xffffffff) >>> 0 } : s.spec;
        this.onEnter({ ...s, spec });
    }

    private quit(): void {
        this.sm.closeAllModals();
        this.paused = false;
        this.gm.save.flush();
        this.sm.home();
    }

    private finish(): void {
        if (!this.pm || !this.session || this.finishing) return;
        this.finishing = true;
        const gm = this.gm;
        const result = this.pm.getResult();
        this.board.setEnabled(false);
        this.scheduleCall(0.25, () => {
            this.board.playSolved();
            gm.audio.play('complete', 0.9);
        });
        const bp = this.board.node.position;
        this.scheduleCall(0.6, () => this.fx.confetti(this.L.w, this.L.h / 2, bp.y - 200, 46));
        gm.analytics.track('puzzle_completed', { mode: this.session.mode, grid: result.grid, time: Math.round(result.timeMs / 1000), moves: result.moves });
        if (this.session.mode === 'daily') gm.analytics.track('daily_challenge_completed', { grid: result.grid, time: Math.round(result.timeMs / 1000) });
        const payload: ResultPayload = { session: this.session, result };
        const goResult = () => this.sm.go('result', payload, { replace: true });
        // 教程庆祝卡片还在时，等玩家点“看结果”再进入结算页
        if (this.tut) this.tutAfter = goResult;
        else this.scheduleCall(1.6, goResult);
    }

    // ------------------------------------------------------------ HUD

    private tick(): void {
        if (!this.pm || this.paused) return;
        const sec = Math.floor(this.pm.timer.elapsedMs / 1000);
        if (sec !== this.lastShownSecond) {
            this.lastShownSecond = sec;
            this.refreshHud(false);
        }
    }

    private refreshHud(full: boolean): void {
        const pm = this.pm;
        if (!pm) return;
        if (this.hell) {
            // 不显示时间、步数和任何限制；成绩在结算页一次性给出
            this.timeLabel.string = '不限时';
            this.movesLabel.string = '不限步数';
            this.goalLabel.string = '拼完再结算';
            if (full) {
                this.hintBtn.setText('无提示');
                this.undoBtn.setEnabled(pm.canUndo);
            }
            return;
        }
        const ms = pm.timer.elapsedMs;
        this.timeLabel.string = formatDuration(ms);
        // “显示剩余时间”：距离三星时间上限还剩多少
        const s = computeStars({ grid: pm.spec.grid, timeMs: ms, moves: pm.moves, hintsUsed: pm.hintsUsed, optimalMoves: pm.optimalMoves, extreme: pm.extreme });
        const left = s.threeStarSeconds * 1000 - ms;
        this.goalLabel.string = left > 0 ? `三星 ${formatDuration(left)}` : `${s.stars} 星进行中`;
        if (!full) return;
        // 已用步数 / 当前星级的步数上限（三星 → 二星 → 不限），让玩家知道乱试的代价
        this.movesLabel.string = movesHudText(pm.moves, s);
        this.hintBtn.setText(`提示 ×${pm.hintsLeft}`);
        if (pm.extreme) {
            this.peekBtn.setText(`看原图 ×${pm.peeksLeft}`);
            this.zoomTagLabel.string = `偷看剩 ${pm.peeksLeft} 次`;
        } else {
            this.peekBtn.setText('按住看原图');
        }
        this.undoBtn.setEnabled(pm.canUndo);
        const done = pm.correctCount;
        this.progressLabel.string = `已归位 ${done}/${pm.n}`;
        const g = this.progressBar;
        g.clear();
        g.fillColor = hex(P.cream3);
        g.rect(-this.progressW / 2, -8, this.progressW, 16);
        g.fill();
        g.fillColor = hex(P.rose);
        g.rect(-this.progressW / 2, -8, (this.progressW * done) / pm.n, 16);
        g.fill();
        g.fillColor = hex(P.pink2);
        g.rect(-this.progressW / 2, 2, (this.progressW * done) / pm.n, 4);
        g.fill();
    }

    // ------------------------------------------------------------ 参考图放大

    private openReference(): void {
        if (!this.pm || this.tut || this.paused) return;
        if (this.pm.extreme) {
            this.sm.toast('极限模式没有目标图，试试“按住看原图”（次数有限）');
            return;
        }
        const gm = this.gm;
        const w = Math.min(this.L.w - 60, 640);
        const art = Math.min(w - 90, 540);
        const h = art + 300;
        const card = this.sm.openModal(w, h);
        label(card, '目标图片', Theme.font.h2, { bold: true }).node.setPosition(0, h / 2 - 54);
        artFrame(card, gm.textures.art(this.pm.spec.imageId), art, 0, h / 2 - 54 - 30 - art / 2 - 10, 'pink');
        label(card, '按照这张图把方块换回原来的位置', Theme.font.small, { color: P.ink2 }).node.setPosition(0, -h / 2 + 135);
        button(card, { w: w - 120, h: 80, text: '知道了', style: 'primary', onClick: () => this.sm.closeModal() }, 0, -h / 2 + 62);
    }

    // ------------------------------------------------------------ 交互式新手教程

    /** 用真实题目里的一对错位方块教学：不消耗提示、不写死格子编号 */
    private startTutorial(): void {
        const pm = this.pm;
        if (!pm) return;
        const hint = pm.peekHint();
        if (!hint) return;
        this.gm.analytics.trackOnce('tutorial_started', 'tutorial_started');
        this.pauseTimer(true);
        this.board.setEnabled(false);
        this.tut = { step: 1, pair: [hint.fromCell, hint.toCell] };
        const layer = makeNode('Tutorial', this.root, 0, 0);
        layer.setSiblingIndex(this.fxLayer.getSiblingIndex());
        this.tutLayer = layer;
        this.tutorialStep(1);
    }

    private addBlocker(x0: number, y0: number, x1: number, y1: number, dim: boolean): void {
        const w = x1 - x0, h = y1 - y0;
        if (w <= 0 || h <= 0 || !this.tutLayer) return;
        const n = makeNode('Blk', this.tutLayer, w, h, (x0 + x1) / 2, (y0 + y1) / 2);
        n.addComponent(BlockInputEvents);
        if (dim) {
            const g = n.addComponent(Graphics);
            g.fillColor = hex(P.ink, 135);
            g.rect(-w / 2, -h / 2, w, h);
            g.fill();
        }
    }

    /** 全屏压暗，只留一个“聚光灯”洞；blockHole=true 时洞里也不可操作 */
    private spotlight(r: { x: number; y: number; w: number; h: number } | null, blockHole: boolean, padX = 10, padY = 10): void {
        const L = this.L;
        const X0 = -L.fullW / 2, X1 = L.fullW / 2, Y0 = -L.fullH / 2, Y1 = L.fullH / 2;
        if (!r) {
            this.addBlocker(X0, Y0, X1, Y1, true);
            return;
        }
        const hx0 = r.x - r.w / 2 - padX, hx1 = r.x + r.w / 2 + padX, hy0 = r.y - r.h / 2 - padY, hy1 = r.y + r.h / 2 + padY;
        this.addBlocker(X0, hy1, X1, Y1, true);
        this.addBlocker(X0, Y0, X1, hy0, true);
        this.addBlocker(X0, hy0, hx0, hy1, true);
        this.addBlocker(hx1, hy0, X1, hy1, true);
        if (blockHole) this.addBlocker(hx0, hy0, hx1, hy1, false);
        // 聚光灯黄色边框
        const frame = makeNode('Frame', this.tutLayer, hx1 - hx0, hy1 - hy0, (hx0 + hx1) / 2, (hy0 + hy1) / 2);
        const g = frame.addComponent(Graphics);
        const w = hx1 - hx0, h = hy1 - hy0, t = 6;
        g.fillColor = hex(P.yellow);
        g.rect(-w / 2, h / 2 - t, w, t);
        g.rect(-w / 2, -h / 2, w, t);
        g.rect(-w / 2, -h / 2 + t, t, h - t * 2);
        g.rect(w / 2 - t, -h / 2 + t, t, h - t * 2);
        g.fill();
    }

    private clearTutorialLayer(): void {
        if (!this.tutLayer) return;
        this.tutLayer.destroyAllChildren();
        this.tutCard = null;
        this.tutBody = null;
    }

    /**
     * 教程卡片：标题 / 正文（顶部对齐）/ 主按钮（底部）/ 右上角“跳过教程”。
     * 卡片高度必须容得下正文：h ≥ 84（标题区）+ 正文高度 + 104（按钮区）。
     * “跳过教程”放在左上角：微信/抖音的胶囊按钮在右上角，会盖住放在右上角的按钮（微信开发者工具中实测发现）。
     */
    private coachCard(cy: number, h: number, title: string, body: string, primary: { text: string; onClick: () => void } | null, skip: boolean): void {
        const gm = this.gm;
        const w = Math.min(this.L.w - 60, 660);
        const card = panel(this.tutLayer!, w, h, { fill: P.cream, border: P.ink, shadow: P.ink, step: Theme.px, shadowDepth: 2 }, 0, cy);
        card.addComponent(BlockInputEvents);
        label(card, title, Theme.font.h2 - 2, { bold: true, color: P.rose2 }).node.setPosition(0, h / 2 - 42);
        const b = label(card, body, Theme.font.small + 2, { color: P.ink, width: w - 64, wrap: true, lineHeight: 1.4 });
        b.node.getComponent(UITransform)!.setAnchorPoint(0.5, 1);
        b.node.setPosition(0, h / 2 - 84);
        this.tutBody = b;
        if (skip) button(card, { w: 150, h: 44, text: '跳过教程', fontSize: Theme.font.small - 4, style: 'ghost', onClick: () => this.skipTutorial() }, -w / 2 + 98, h / 2 - 36);
        if (primary) button(card, { w: w - 120, h: 72, text: primary.text, style: 'primary', onClick: primary.onClick }, 0, -h / 2 + 16 + 36);
        this.tutCard = card;
        const op = opacityOf(card);
        op.opacity = 0;
        tween(op).to(0.18, { opacity: 255 }).start();
        gm.audio.play('pick', 0.4);
    }

    private tutorialStep(step: 1 | 2 | 3 | 4): void {
        if (!this.tut) return;
        this.tut.step = step;
        this.clearTutorialLayer();
        const L = this.L;
        // 卡片可以盖住被压暗的标题栏，这样棋盘上方有足够空间放文字
        const topY = L.headerY + 36;
        if (step === 1) {
            this.board.setTutorialPair(null);
            this.spotlight(this.refRect, true, 10, 34);
            const h = 320;
            this.coachCard(this.boardRect.y + 150, h, '第一步：看看目标', '这就是你最终需要拼出来的图片。\n它会一直显示在左上角，随时对照，点一下还能放大。', { text: '下一步', onClick: () => this.tutorialStep(2) }, true);
        } else if (step === 2) {
            this.board.setTutorialPair(this.tut.pair);
            this.spotlight(this.boardRect, true);
            const h = 310;
            this.coachCard(topY - h / 2, h, '第二步：认识交换', '找到位置不对的方块，点击它，再点击它应该去的位置，就可以交换啦！\n粉框是要动的方块，绿框是它的家。', { text: '我来试试', onClick: () => this.tutorialStep(3) }, true);
        } else if (step === 3) {
            // 只压暗棋盘以外的区域；棋盘本身可以操作，但只允许这一对方块
            this.board.setEnabled(true);
            this.board.setTutorialPair(this.tut.pair);
            this.spotlight(this.boardRect, false);
            const h = 220;
            this.coachCard(topY - h / 2, h, '第三步：你来试试', '先点粉框的方块，再点绿框的位置。\n也可以直接把粉框方块拖到绿框里。', null, true);
        } else {
            this.board.setTutorialPair(null);
            this.spotlight(null, true);
        }
    }

    /** 教程中碰了不该碰的方块：温和提示，不惩罚 */
    private onTutorialMistake(): void {
        if (!this.tut || this.tut.step !== 3) return;
        this.gm.audio.play('error', 0.5);
        if (this.tutBody) this.tutBody.string = '这块暂时不用动哦～\n请先点粉框的方块，再点绿框的位置。';
        if (this.tutCard) {
            Tween.stopAllByTarget(this.tutCard);
            this.tutCard.setPosition(0, this.tutCard.position.y, 0);
            tween(this.tutCard).to(0.05, { position: new Vec3(-10, this.tutCard.position.y, 0) }).to(0.08, { position: new Vec3(10, this.tutCard.position.y, 0) }).to(0.05, { position: new Vec3(0, this.tutCard.position.y, 0) }).start();
        }
    }

    /** 玩家完成了教程里的交换（真实的一步，不会自动代劳） */
    private completeTutorialMove(): void {
        if (!this.tut) return;
        this.tut.step = 4;
        this.gm.save.mutate((d) => (d.tutorial.puzzleBasics = true), true);
        this.gm.analytics.trackOnce('tutorial_completed', 'tutorial_completed');
        this.board.setTutorialPair(null);
        this.board.setEnabled(false);
        this.clearTutorialLayer();
        this.scheduleCall(0.8, () => this.showCelebration());
    }

    private showCelebration(): void {
        if (!this.tut || !this.tutLayer) return;
        const solved = !!this.pm && this.pm.finished;
        this.clearTutorialLayer();
        this.spotlight(null, true);
        const h = 340;
        this.coachCard(this.boardRect.y + 40, h, '太棒了！', solved ? '你学会啦！这张小拼图已经完成。\n以后遇到更多方块，也是同样的玩法～' : '你学会基本玩法啦！\n接下来把剩下的方块都换回原位吧。', {
            text: solved ? '看结果' : '继续拼图',
            onClick: () => this.endTutorial(),
        }, false);
        this.gm.audio.play('star', 0.8);
        this.fx.confetti(this.L.w, this.boardRect.y + 300, this.boardRect.y - 300, 30);
    }

    private endTutorial(): void {
        const after = this.tutAfter;
        this.closeTutorial(true);
        if (after) after();
    }

    private skipTutorial(): void {
        this.gm.save.mutate((d) => (d.tutorial.puzzleBasics = true), true);
        this.closeTutorial(true);
    }

    private closeTutorial(resume: boolean): void {
        if (this.tutLayer) {
            this.tutLayer.destroy();
            this.tutLayer = null;
        }
        this.tutCard = null;
        this.tutBody = null;
        this.tutAfter = null;
        const wasActive = !!this.tut;
        this.tut = null;
        if (!wasActive) return;
        this.board.setTutorialPair(null);
        if (resume && this.pm && !this.pm.finished) {
            this.board.setEnabled(true);
            if (this.pm.timer.started) this.pauseTimer(false);
        }
    }

    private scheduleCall(delay: number, fn: () => void): void {
        tween(this.root).delay(delay).call(fn).start();
    }
}
