import { EventTouch, Graphics, Node, Sprite, tween, UITransform, Vec3 } from 'cc';
import { P } from '../art/Palette';
import { TextureFactory } from '../art/TextureFactory';
import { hex, Theme } from '../ui/Theme';
import { drawPanel, makeNode, sprite, opacityOf } from '../ui/UIKit';
import { BoardThemeColors, resolveBoardTheme } from '../progress/ShopConfig';
import { PuzzleManager, SwapOutcome } from './PuzzleManager';
import { PiecePool, PuzzlePiece } from './PuzzlePiece';

export interface BoardCallbacks {
    /** 第一次触碰有效方块（开始计时） */
    onFirstTouch(): void;
    onPick(): void;
    onSwap(outcome: SwapOutcome, a: number, b: number): void;
    onLockedTouch(): void;
    /** 教程限制下，玩家碰了不该碰的方块或做了不该做的交换 */
    onRestricted?(cell: number): void;
}

const GAP = 4;
const DRAG_THRESHOLD = 10;

/**
 * 拼图板视图 + 输入（cc）。规则全部委托给 PuzzleManager。
 *
 * 操作方式：
 * 1. 按住方块拖到另一个方块上 → 交换（方块跟随手指，目标格薄荷绿高亮）；
 * 2. 轻点一个方块选中，再点另一个 → 交换（适合单手/精细操作）。
 * 触摸监听只挂在棋盘节点上一次，不给每个方块单独注册，减少事件开销。
 */
export class PuzzleBoard {
    readonly node: Node;
    private bg: Graphics;
    private pieceLayer: Node;
    private peekSprite: Node;
    private peek: Sprite;
    private pool = new PiecePool();
    private pieces: PuzzlePiece[] = []; // 按格子索引
    private pm: PuzzleManager | null = null;
    private boardSize: number;
    private cell = 0;
    private grid = 4;
    private imageId = '';

    private touchCell = -1;
    private dragging = false;
    private dragOffset = new Vec3();
    private selectedCell = -1;
    private hoverCell = -1;
    private enabled = true;
    private solvedLook = false;
    private arrow!: Graphics;
    /** 当前正在显示的引导：from=被拿起/被指示的方块所在格，to=它应该去的格 */
    private gFrom = -1;
    private gTo = -1;
    /** 固定引导（提示按钮、教程）：不依赖玩家选中 */
    private pin: { from: number; to: number; sticky: boolean } | null = null;
    private pinToken = 0;
    /** 教程限制：只允许操作这两个格子 */
    private restrict: [number, number] | null = null;

    constructor(parent: Node, boardSize: number, private readonly textures: TextureFactory, private readonly cb: BoardCallbacks) {
        this.boardSize = boardSize;
        this.node = makeNode('Board', parent, boardSize, boardSize);
        const bgNode = makeNode('BoardBg', this.node, boardSize, boardSize);
        this.bg = bgNode.addComponent(Graphics);
        this.pieceLayer = makeNode('Pieces', this.node, boardSize, boardSize);
        this.arrow = makeNode('Arrow', this.node, boardSize, boardSize).addComponent(Graphics);
        this.peek = sprite(this.node, null, boardSize - 24, boardSize - 24);
        this.peekSprite = this.peek.node;
        this.peekSprite.active = false;

        this.node.on(Node.EventType.TOUCH_START, this.onStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onCancel, this);
    }

    get inner(): number {
        return this.boardSize - 24;
    }

    /** 开始一局：从对象池取方块并按当前布局摆放 */
    start(pm: PuzzleManager): void {
        this.clear();
        this.pm = pm;
        this.grid = pm.grid;
        this.imageId = pm.spec.imageId;
        this.cell = this.inner / this.grid;
        this.enabled = true;
        this.solvedLook = false;
        this.gFrom = -1;
        this.gTo = -1;
        this.pin = null;
        this.restrict = null;
        this.arrow.clear();
        this.drawBackground();
        const sz = this.cell - GAP;
        for (let c = 0; c < pm.n; c++) {
            const id = pm.pieceAt(c);
            const p = this.pool.get();
            p.setup(this.textures.piece(this.imageId, this.grid, id), sz, id);
            this.pieceLayer.addChild(p.node);
            p.node.setPosition(this.center(c));
            this.pieces[c] = p;
        }
        this.peek.spriteFrame = this.textures.art(this.imageId);
        // 入场：方块依次弹出
        this.pieces.forEach((p, i) => {
            p.node.setScale(0.2, 0.2, 1);
            tween(p.node)
                .delay(0.012 * i)
                .to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                .start();
        });
    }

    clear(): void {
        for (const p of this.pieces) if (p) {
            p.node.removeFromParent();
            this.pool.put(p);
        }
        this.pieces = [];
        this.selectedCell = -1;
        this.touchCell = -1;
        this.dragging = false;
        this.hoverCell = -1;
        this.gFrom = -1;
        this.gTo = -1;
        this.pin = null;
        this.restrict = null;
        this.arrow.clear();
        this.pm = null;
    }

    setEnabled(v: boolean): void {
        this.enabled = v;
        if (!v) this.cancelDrag();
    }

    private theme: BoardThemeColors = resolveBoardTheme('classic');

    /** 换棋盘配色（兑换所里兑换的）；下一次 start() 时生效 */
    setTheme(key: string): void {
        this.theme = resolveBoardTheme(key);
    }

    private drawBackground(): void {
        const s = this.boardSize;
        drawPanel(this.bg, s, s, { fill: this.theme.fill, border: this.theme.border, shadow: this.theme.border, step: Theme.px, shadowDepth: 2 });
        // 格子底槽
        this.bg.fillColor = hex(this.theme.slot, 160);
        const sz = this.cell - GAP;
        for (let c = 0; c < this.grid * this.grid; c++) {
            const p = this.center(c);
            this.bg.rect(p.x - sz / 2, p.y - sz / 2, sz, sz);
        }
        this.bg.fill();
    }

    /** 格子中心（棋盘本地坐标），行优先、从上到下 */
    center(cell: number): Vec3 {
        const col = cell % this.grid;
        const row = Math.floor(cell / this.grid);
        const x = -this.inner / 2 + this.cell * (col + 0.5);
        const y = this.inner / 2 - this.cell * (row + 0.5);
        return new Vec3(x, y, 0);
    }

    cellAt(x: number, y: number): number {
        const half = this.inner / 2;
        if (x < -half || x >= half || y <= -half || y > half) return -1;
        const col = Math.floor((x + half) / this.cell);
        const row = Math.floor((half - y) / this.cell);
        if (col < 0 || row < 0 || col >= this.grid || row >= this.grid) return -1;
        return row * this.grid + col;
    }

    private local(e: EventTouch): Vec3 {
        const ui = e.getUILocation();
        return this.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    }

    private onStart(e: EventTouch): void {
        if (!this.enabled || !this.pm || this.pm.finished) return;
        const p = this.local(e);
        const c = this.cellAt(p.x, p.y);
        if (c < 0) return;
        if (this.restrict && c !== this.restrict[0] && c !== this.restrict[1]) {
            this.pieces[c].wiggle();
            if (this.cb.onRestricted) this.cb.onRestricted(c);
            return;
        }
        if (!this.pm.canPick(c)) {
            this.pieces[c].wiggle();
            this.cb.onLockedTouch();
            return;
        }
        // 提示的临时引导在玩家重新操作时消失；教程引导保持
        if (this.pin && !this.pin.sticky) this.setPin(null);
        this.cb.onFirstTouch();
        this.touchCell = c;
        this.dragging = false;
        const node = this.pieces[c].node;
        this.dragOffset = new Vec3(node.position.x - p.x, node.position.y - p.y, 0);
    }

    private onMove(e: EventTouch): void {
        if (this.touchCell < 0 || !this.pm) return;
        const p = this.local(e);
        const piece = this.pieces[this.touchCell];
        if (!this.dragging) {
            const s = e.getUIStartLocation(), u = e.getUILocation();
            if (Math.abs(s.x - u.x) + Math.abs(s.y - u.y) < DRAG_THRESHOLD) return;
            this.dragging = true;
            this.clearSelection();
            piece.stopTweens();
            piece.node.setSiblingIndex(this.pieceLayer.children.length - 1);
            tween(piece.node).to(0.08, { scale: new Vec3(1.1, 1.1, 1) }).start();
            this.refreshGuide(this.touchCell);
            this.cb.onPick();
        }
        // 限制在棋盘范围内移动
        const lim = this.inner / 2;
        piece.node.setPosition(Math.max(-lim, Math.min(lim, p.x + this.dragOffset.x)), Math.max(-lim, Math.min(lim, p.y + this.dragOffset.y)), 0);
        const target = this.cellAt(p.x, p.y);
        const valid = target >= 0 && target !== this.touchCell && this.pm.canPick(target) ? target : -1;
        if (valid !== this.hoverCell) {
            this.restoreGlow(this.hoverCell);
            this.hoverCell = valid;
            // 悬停在“正确目标格”上时保持绿色，不改成普通悬停色
            if (valid >= 0 && valid !== this.gTo) this.pieces[valid].setGlow('target');
        }
    }

    private onEnd(e: EventTouch): void {
        if (this.touchCell < 0 || !this.pm) return;
        const from = this.touchCell;
        this.touchCell = -1;
        this.restoreGlow(this.hoverCell);
        this.hoverCell = -1;
        if (this.dragging) {
            this.dragging = false;
            const p = this.local(e);
            const target = this.cellAt(p.x, p.y);
            this.clearGuide();
            this.pieces[from].setGlow('none');
            if (target >= 0 && target !== from) this.doSwap(from, target, true);
            else {
                this.pieces[from].moveTo(this.center(from), 0.15);
                this.refreshGuide(-1);
            }
            return;
        }
        // 点选交换
        if (this.selectedCell < 0) {
            this.selectedCell = from;
            const piece = this.pieces[from];
            tween(piece.node).to(0.08, { scale: new Vec3(1.06, 1.06, 1) }).start();
            this.refreshGuide(from);
            this.cb.onPick();
        } else if (this.selectedCell === from) {
            this.clearSelection();
        } else {
            const a = this.selectedCell;
            this.clearSelection();
            this.doSwap(a, from, false);
        }
    }

    private onCancel(): void {
        this.cancelDrag();
    }

    private cancelDrag(): void {
        if (this.touchCell >= 0 && this.pieces[this.touchCell]) {
            this.pieces[this.touchCell].setGlow('none');
            this.pieces[this.touchCell].moveTo(this.center(this.touchCell), 0.15);
        }
        this.restoreGlow(this.hoverCell);
        this.touchCell = -1;
        this.hoverCell = -1;
        this.dragging = false;
        this.refreshGuide(this.selectedCell);
    }

    // ------------------------------------------------------------ 引导（目标格高亮 + 箭头）

    /** 悬停高亮离开后，把格子恢复成引导应有的颜色 */
    private restoreGlow(cell: number): void {
        if (cell < 0 || !this.pieces[cell]) return;
        this.pieces[cell].setGlow(cell === this.gTo ? 'dest' : cell === this.gFrom ? 'selected' : 'none');
    }

    /**
     * 刷新引导。
     * - 玩家拿起/选中方块时只高亮这块本身（粉框），**不再**自动提示它该去哪（不画箭头、不高亮目标格）；
     * - 固定引导（玩家主动点“提示”、新手教程）才显示“粉色源 → 绿色目标 + 箭头”；
     *   教程里拿起的正好是引导中的方块时，引导保持显示。
     */
    private refreshGuide(activeFrom: number): void {
        const pm = this.pm;
        let from = -1, to = -1;
        if (pm) {
            if (activeFrom >= 0 && this.pieces[activeFrom] && !(this.pin && this.pin.from === activeFrom)) {
                from = activeFrom;
            } else if (this.pin) {
                from = this.pin.from;
                to = this.pin.to;
                if (to === from || to < 0 || to >= pm.n || pm.isCellCorrect(to) || pm.isCellCorrect(from)) {
                    from = -1;
                    to = -1;
                }
            }
        }
        if (from === this.gFrom && to === this.gTo) return;
        this.clearGuide();
        if (from < 0) return;
        this.gFrom = from;
        this.gTo = to;
        this.pieces[from].setGlow('selected');
        if (to < 0) return;
        const dest = this.pieces[to];
        dest.setGlow('dest');
        dest.pulseLoop(true);
        this.drawArrow(from, to);
    }

    private clearGuide(): void {
        if (this.gFrom >= 0 && this.pieces[this.gFrom]) this.pieces[this.gFrom].setGlow('none');
        if (this.gTo >= 0 && this.pieces[this.gTo]) {
            this.pieces[this.gTo].setGlow('none');
            this.pieces[this.gTo].pulseLoop(false);
        }
        this.gFrom = -1;
        this.gTo = -1;
        this.arrow.clear();
    }

    /** 像素风虚线箭头：从方块当前格指向它的正确格 */
    private drawArrow(from: number, to: number): void {
        const g = this.arrow;
        g.clear();
        const a = this.center(from), b = this.center(to);
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return;
        const ux = dx / len, uy = dy / len;
        const margin = this.cell * 0.34;
        const head = Math.min(34, this.cell * 0.3);
        const lineEnd = len - margin - head * 0.6;
        for (let t = margin; t < lineEnd; t += 18) {
            g.fillColor = hex(P.ink);
            g.rect(a.x + ux * t - 7, a.y + uy * t - 7, 14, 14);
            g.fill();
        }
        for (let t = margin; t < lineEnd; t += 18) {
            g.fillColor = hex(P.yellow);
            g.rect(a.x + ux * t - 4, a.y + uy * t - 4, 8, 8);
            g.fill();
        }
        // 箭头头部（三角形，先描边再填色）
        const tipX = b.x - ux * margin, tipY = b.y - uy * margin;
        const nx = -uy, ny = ux;
        const tri = (k: number, color: number) => {
            g.fillColor = hex(color);
            g.moveTo(tipX + ux * k, tipY + uy * k);
            g.lineTo(tipX - ux * (head + k) + nx * (head * 0.62 + k), tipY - uy * (head + k) + ny * (head * 0.62 + k));
            g.lineTo(tipX - ux * (head + k) - nx * (head * 0.62 + k), tipY - uy * (head + k) - ny * (head * 0.62 + k));
            g.close();
            g.fill();
        };
        tri(5, P.ink);
        tri(0, P.yellow);
    }

    /** 清除全部引导（撤销、暂停等外部改变布局时调用） */
    resetGuide(): void {
        if (!this.restrict) this.pin = null;
        this.clearSelection();
    }

    /** 固定引导：提示按钮 / 教程。sticky=true 时玩家操作不会让它消失 */
    private setPin(pin: { from: number; to: number; sticky: boolean } | null): void {
        this.pin = pin;
        this.pinToken++;
        this.refreshGuide(this.selectedCell);
    }

    private clearSelection(): void {
        if (this.selectedCell >= 0 && this.pieces[this.selectedCell]) {
            const p = this.pieces[this.selectedCell];
            tween(p.node).to(0.08, { scale: new Vec3(1, 1, 1) }).start();
        }
        this.selectedCell = -1;
        this.clearGuide();
        this.refreshGuide(-1);
    }

    private doSwap(a: number, b: number, fromDrag: boolean): void {
        if (!this.pm) return;
        if (this.restrict) {
            const ok = (a === this.restrict[0] && b === this.restrict[1]) || (a === this.restrict[1] && b === this.restrict[0]);
            if (!ok) {
                this.pieces[a].moveTo(this.center(a), 0.15);
                this.pieces[b].wiggle();
                this.refreshGuide(-1);
                if (this.cb.onRestricted) this.cb.onRestricted(b);
                return;
            }
        }
        // 先清掉引导和呼吸动画，再执行交换动画
        this.clearGuide();
        if (this.pin) this.pin = null;
        const outcome = this.pm.trySwap(a, b);
        if (!outcome.swapped) {
            this.pieces[a].moveTo(this.center(a), 0.15);
            if (outcome.reason === 'locked') this.pieces[b].wiggle();
            return;
        }
        this.applyVisualSwap(a, b, fromDrag ? 0.14 : 0.2);
        this.cb.onSwap(outcome, a, b);
    }

    /** 交换两个格子的方块视图并做动画（撤销也复用） */
    applyVisualSwap(a: number, b: number, duration = 0.2): void {
        const pa = this.pieces[a], pb = this.pieces[b];
        this.pieces[a] = pb;
        this.pieces[b] = pa;
        pa.node.setSiblingIndex(this.pieceLayer.children.length - 1);
        pa.moveTo(this.center(b), duration);
        pb.moveTo(this.center(a), duration);
    }

    /** 归位反馈（由页面在 onSwap 中调用，以便同时播放音效/特效） */
    celebrateCell(cell: number): Vec3 {
        const p = this.pieces[cell];
        this.scheduleOnce(() => p.bounce(), 0.16);
        return this.center(cell);
    }

    /** 提示：用同一套“粉色源 → 绿色目标 + 箭头”演示正确的交换，停留约 3.5 秒或玩家下次操作时消失 */
    showHint(fromCell: number, toCell: number): void {
        this.clearSelection();
        this.setPin({ from: fromCell, to: toCell, sticky: false });
        const token = this.pinToken;
        this.scheduleOnce(() => {
            if (this.pin && this.pinToken === token) this.setPin(null);
        }, 3.5);
    }

    /** 教程：固定显示一对方块的交换引导，并限制只能操作这两个格子（传 null 解除） */
    setTutorialPair(pair: [number, number] | null): void {
        this.restrict = pair;
        this.clearSelection();
        this.setPin(pair ? { from: pair[0], to: pair[1], sticky: true } : null);
    }

    /** 查看原图：覆盖在棋盘上 */
    setPeek(show: boolean): void {
        this.peekSprite.active = show;
        if (show) {
            this.peekSprite.setSiblingIndex(this.node.children.length - 1);
            const op = opacityOf(this.peekSprite);
            op.opacity = 0;
            tween(op).to(0.12, { opacity: 255 }).start();
        }
    }

    /** 完成：缝隙闭合成完整画面 */
    playSolved(): void {
        if (this.solvedLook) return;
        this.solvedLook = true;
        this.enabled = false;
        const full = this.cell;
        this.pieces.forEach((p, c) => {
            p.stopTweens();
            p.node.setScale(1, 1, 1);
            p.setGlow('none');
            tween(p.node)
                .delay(0.05)
                .to(0.25, { position: this.center(c) }, { easing: 'quadOut' })
                .call(() => p.resize(full + 0.5, false))
                .start();
        });
        tween(this.node)
            .delay(0.32)
            .to(0.12, { scale: new Vec3(1.04, 1.04, 1) })
            .to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();
    }

    private scheduleOnce(fn: () => void, delay: number): void {
        tween(this.node).delay(delay).call(fn).start();
    }
}
