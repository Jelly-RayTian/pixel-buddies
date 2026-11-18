import { _decorator, Canvas, Component, Director, director, game, Game, Graphics, Node, ResolutionPolicy, Scene, screen, Sprite, sys, view } from 'cc';
import { DEBUG, EDITOR } from 'cc/env';
import { P } from '../art/Palette';
import { AudioManager } from '../audio/AudioManager';
import { MusicContext, pickBgm } from '../audio/MusicCatalog';
import { CHALLENGE } from '../config/GameConfig';
import { ChallengePage } from '../pages/ChallengePage';
import { ClassicPage } from '../pages/ClassicPage';
import { CollectionPage } from '../pages/CollectionPage';
import { DailyPage } from '../pages/DailyPage';
import { GamePage } from '../pages/GamePage';
import { HomePage } from '../pages/HomePage';
import { showIncomingChallenge } from '../pages/PageKit';
import { ResultPage } from '../pages/ResultPage';
import { SettingsPage } from '../pages/SettingsPage';
import { WorkshopPage } from '../pages/WorkshopPage';
import { PolicyPage } from '../pages/PolicyPage';
import { SeriesPage } from '../pages/SeriesPage';
import { RewardPage } from '../pages/RewardPage';
import { GoalsPage } from '../pages/GoalsPage';
import { ProfilePage } from '../pages/ProfilePage';
import { HistoryPage } from '../pages/HistoryPage';
import { FeedbackPage } from '../pages/FeedbackPage';
import { ShopPage } from '../pages/ShopPage';
import { shouldRelayout } from './RelayoutPolicy';
import { createPlatformAdapter } from '../platform/PlatformFactory';
import { PlatformAdapter } from '../platform/PlatformAdapter';
import { hex, Theme } from '../ui/Theme';
import { makeNode, UIHooks } from '../ui/UIKit';
import { GameManager, Layout } from './GameManager';
import { SceneManager } from './SceneManager';

const { ccclass } = _decorator;

export const DESIGN_W = 720;
export const DESIGN_H = 1280;

/**
 * 游戏入口组件（挂在 Main.scene 的 Canvas/GameRoot 节点上）。
 * 负责：分辨率与安全区、平台适配初始化、服务容器、页面注册、生命周期、分享入口。
 */
@ccclass('GameRoot')
export class GameRoot extends Component {
    private gm!: GameManager;
    private sm!: SceneManager;

    onLoad(): void {
        // 竖屏 9:16 设计：
        // - 比 9:16 更高的屏幕（绝大多数手机）：宽度适配，多出来的纵向空间留给布局；
        // - 比 9:16 更矮/更宽的屏幕（iPad、编辑器预览窗口、折叠屏展开）：高度适配，
        //   内容保持 720 宽居中，两侧只铺背景，避免按钮互相重叠。
        const frame = screen.windowSize;
        const tall = frame.width <= 0 || frame.height / frame.width >= DESIGN_H / DESIGN_W - 0.001;
        view.setDesignResolutionSize(DESIGN_W, DESIGN_H, tall ? ResolutionPolicy.FIXED_WIDTH : ResolutionPolicy.FIXED_HEIGHT);

        const platform = createPlatformAdapter(String(sys.platform));
        this.gm = new GameManager(platform);
        this.gm.analytics.setDebug(DEBUG);
        // 旧存档里已经集齐的系列：补发奖励记录（升级后第一次进入收藏册会看到庆祝页）
        this.gm.collection.syncRewards();
        this.gm.layout = this.computeLayout(platform);
        console.log(`[PixelBuddies] 平台：${platform.displayName}，可视区域 ${this.gm.layout.w}×${Math.round(this.gm.layout.h)}`);

        const L = this.gm.layout;
        this.buildBackground(L);
        const pageLayer = makeNode('Pages', this.node, L.w, L.h);
        const overlay = makeNode('Overlay', this.node, L.fullW, L.fullH);
        this.sm = new SceneManager(pageLayer, overlay, L.fullW, L.fullH);
        this.gm.scene = this.sm;

        const audio = new AudioManager(this.node);
        audio.setEnabled(this.gm.settings.sfx, this.gm.settings.music);
        audio.load();
        this.gm.audio = audio;
        audio.onLoadFailed = (kind, id) => this.gm.analytics.trackOnce(`alf:${kind}:${id}`, 'asset_load_failed', { kind, id });
        UIHooks.onButtonClick = () => audio.play('click', 0.6);
        // 背景音乐跟随页面/主题切换（规则见 MusicCatalog.pickBgm）
        const musicCtx: MusicContext = {};
        this.sm.onPageEnter = (name, params) => {
            const id = pickBgm(name, params, musicCtx);
            if (id) audio.playMusic(id);
            this.relayoutIfNeeded(name);
        };

        this.sm.register(new HomePage(this.sm, 'home'));
        this.sm.register(new ClassicPage(this.sm, 'classic'));
        this.sm.register(new GamePage(this.sm, 'game'));
        this.sm.register(new ResultPage(this.sm, 'result'));
        this.sm.register(new DailyPage(this.sm, 'daily'));
        this.sm.register(new CollectionPage(this.sm, 'collection'));
        this.sm.register(new SettingsPage(this.sm, 'settings'));
        this.sm.register(new ChallengePage(this.sm, 'challenge'));
        this.sm.register(new WorkshopPage(this.sm, 'workshop'));
        this.sm.register(new PolicyPage(this.sm, 'policy'));
        this.sm.register(new SeriesPage(this.sm, 'series'));
        this.sm.register(new RewardPage(this.sm, 'reward'));
        this.sm.register(new GoalsPage(this.sm, 'goals'));
        this.sm.register(new ProfilePage(this.sm, 'profile'));
        this.sm.register(new HistoryPage(this.sm, 'history'));
        this.sm.register(new FeedbackPage(this.sm, 'feedback'));
        this.sm.register(new ShopPage(this.sm, 'shop'));

        this.bindLifecycle(platform);
        this.gm.share.registerPassiveShare();
    }

    start(): void {
        this.sm.go('home');
        // 同意匿名统计之前不会发出任何事件；加载耗时 = 从页面开始加载到首页出现（仅 Web 可测）
        const perf = (globalThis as { performance?: { now(): number } }).performance;
        this.gm.announceSession(this.gm.platform.kind === 'web' && perf ? perf.now() : undefined);
        this.bindErrorReporting();
        const boot = (globalThis as { __pbBoot?: { ready(): void } }).__pbBoot;
        if (boot) boot.ready();
        // 冷启动：从分享卡片进入时 query 中带有挑战数据
        const launch = this.gm.platform.getLaunchInfo();
        this.handleQuery(launch.query);
    }

    onDestroy(): void {
        if (this.gm) this.gm.save.flush();
        game.off(Game.EVENT_HIDE, this.onHide, this);
        game.off(Game.EVENT_SHOW, this.onShow, this);
    }

    private handleQuery(query: Record<string, string>): void {
        const raw = query && query[CHALLENGE.queryKey];
        if (!raw) return;
        // 稍等首页过渡完成再弹出
        this.scheduleOnce(() => {
            if (this.sm.currentName === 'game') return; // 正在游戏中不打断
            showIncomingChallenge(raw);
        }, 0.4);
    }

    /** Web：窗口大小/方向明显变化后，在安全的页面切换时刷新一次以重新布局（进度已保存） */
    private relayoutIfNeeded(page: string): void {
        if (this.gm.platform.kind !== 'web') return;
        const g = globalThis as { location?: { reload(): void }; sessionStorage?: Storage };
        if (!g.location) return;
        const vis = view.getVisibleSize();
        let last = 0;
        try {
            last = Number(g.sessionStorage?.getItem('pb_relayout_at') || 0);
        } catch {
            /* 无痕模式下可能不可用 */
        }
        const L = this.gm.layout;
        if (!shouldRelayout({ w: L.fullW, h: L.fullH }, { w: vis.width, h: vis.height }, page, last, Date.now())) return;
        try {
            g.sessionStorage?.setItem('pb_relayout_at', String(Date.now()));
        } catch {
            /* 忽略 */
        }
        this.gm.save.flush();
        g.location.reload();
    }

    private bindLifecycle(platform: PlatformAdapter): void {
        // 引擎在各平台统一派发前后台事件（小游戏内部对接 wx.onHide/tt.onHide）
        game.on(Game.EVENT_HIDE, this.onHide, this);
        game.on(Game.EVENT_SHOW, this.onShow, this);
        // 热启动：已在后台运行时点击分享卡片，新的 query 通过平台 onShow 送达
        platform.onShow((info) => this.handleQuery(info.query));
    }

    /** 未捕获的错误只记“种类 + 短信息”（网址/路径会被抹掉），每个会话最多 5 条，绝不影响游戏 */
    private bindErrorReporting(): void {
        const g = globalThis as { addEventListener?: (t: string, f: (e: unknown) => void) => void };
        if (typeof g.addEventListener !== 'function') return;
        let n = 0;
        const report = (kind: string, msg: unknown) => {
            if (n++ >= 5) return;
            try {
                this.gm.analytics.track('game_error', { kind, msg: String(msg || '').slice(0, 80) });
            } catch {
                /* 统计出错也不能再抛 */
            }
        };
        g.addEventListener('error', (e) => report('error', (e as { message?: string }).message));
        g.addEventListener('unhandledrejection', (e) => report('promise', ((e as { reason?: { message?: string } }).reason || {}).message || (e as { reason?: unknown }).reason));
    }

    private onHide(): void {
        this.gm.onAppHidden();
        this.gm.save.flush();
        this.gm.audio.suspend();
        this.gm.events.emit('app:hide');
        this.sm.notifyAppHide();
    }

    private onShow(): void {
        this.gm.onAppShown();
        this.gm.audio.resume();
    }

    /** 计算设计坐标下的安全区与头部位置（避开刘海、Home 条与小游戏右上角胶囊按钮） */
    private computeLayout(platform: PlatformAdapter): Layout {
        const vis = view.getVisibleSize();
        const fullW = vis.width;
        const fullH = vis.height;
        // 内容区：最宽 720（矮屏时居中，两侧留背景）
        const w = Math.min(fullW, DESIGN_W);
        const h = fullH;
        const win = platform.getWindowSize();
        const scale = win.width > 0 ? fullW / win.width : 1;

        const ins = platform.getSafeInsets();
        let safeTop = ins.top * scale;
        let safeBottom = ins.bottom * scale;
        // 引擎提供的安全区（Web/原生）作为补充
        try {
            const sa = sys.getSafeAreaRect();
            const origin = view.getVisibleOrigin();
            safeTop = Math.max(safeTop, origin.y + h - (sa.y + sa.height));
            safeBottom = Math.max(safeBottom, sa.y - origin.y);
        } catch {
            /* 部分平台不支持，忽略 */
        }
        safeTop = Math.max(0, Math.min(safeTop, h * 0.12));
        safeBottom = Math.max(0, Math.min(safeBottom, h * 0.08));

        let headerY = h / 2 - safeTop - 60;
        let headerRight = w / 2 - Theme.gutter;
        const menu = platform.getMenuButtonRect();
        if (menu) {
            const centerFromTop = (menu.top + menu.height / 2) * scale;
            headerY = Math.min(headerY, h / 2 - centerFromTop);
            headerRight = Math.min(headerRight, menu.left * scale - fullW / 2 - 16);
        }
        return { w, h, fullW, fullH, safeTop, safeBottom, headerY, headerRight, contentTop: headerY - 64 };
    }

    /** 全局背景：奶油底色 + 像素波点平铺（一个 Sprite，开销极低） */
    private buildBackground(L: Layout): void {
        const bg = makeNode('Background', this.node, L.fullW, L.fullH);
        const g = bg.addComponent(Graphics);
        g.fillColor = hex(Theme.bg);
        g.rect(-L.fullW / 2, -L.fullH / 2, L.fullW, L.fullH);
        g.fill();
        const tile = this.gm.textures.pattern('bgdots', (c) => {
            c.fill(Theme.bg);
            c.rect(2, 2, 2, 2, Theme.bgDot);
            c.rect(10, 10, 2, 2, Theme.bgDot);
            c.px(12, 3, P.pink);
            c.px(4, 12, P.mint);
        }, 16);
        const tiled = makeNode('Dots', bg, L.fullW / 3, L.fullH / 3);
        tiled.setScale(3, 3, 1);
        const sp = tiled.addComponent(Sprite);
        sp.type = Sprite.Type.TILED;
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = tile;
    }
}

/**
 * 兜底引导：如果场景中的 GameRoot 组件引用丢失（例如在编辑器中误删），
 * 自动把 GameRoot 挂到场景 Canvas 上，保证游戏仍可启动。编辑器模式下不执行。
 */
if (!EDITOR) {
    director.on(Director.EVENT_AFTER_SCENE_LAUNCH, (scene: Scene) => {
        if (!scene || GameManager.ready) return;
        if (scene.getComponentInChildren(GameRoot)) return;
        const canvas = scene.getComponentInChildren(Canvas);
        if (!canvas) {
            console.error('[PixelBuddies] 场景中没有 Canvas，无法启动');
            return;
        }
        const host = new Node('GameRoot');
        host.layer = canvas.node.layer;
        canvas.node.addChild(host);
        host.addComponent(GameRoot);
        console.warn('[PixelBuddies] 场景未挂载 GameRoot，已自动挂载');
    });
}
