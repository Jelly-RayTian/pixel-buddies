import { Node } from 'cc';
import { GameManager, Layout } from '../core/GameManager';
import type { SceneManager } from '../core/SceneManager';
import { P } from '../art/Palette';
import { Theme } from '../ui/Theme';
import { button, ButtonHandle, label, makeNode } from '../ui/UIKit';

export type PageName = 'home' | 'classic' | 'game' | 'result' | 'daily' | 'collection' | 'settings' | 'challenge' | 'workshop' | 'policy' | 'series' | 'reward' | 'goals' | 'profile' | 'history' | 'feedback' | 'shop';

/**
 * 页面基类。页面节点只构建一次（build），每次进入调用 onEnter 刷新数据，
 * 避免频繁创建/销毁节点。页面之间通过 SceneManager.go() 切换。
 */
export abstract class BasePage {
    readonly root: Node;
    protected built = false;

    constructor(protected readonly sm: SceneManager, readonly name: PageName) {
        this.root = makeNode(`Page_${name}`, null, 0, 0);
    }

    get gm(): GameManager {
        return GameManager.I;
    }

    get L(): Layout {
        return GameManager.I.layout;
    }

    ensureBuilt(): void {
        if (this.built) return;
        this.built = true;
        this.build();
    }

    protected abstract build(): void;

    /** 进入页面（每次显示时调用） */
    onEnter(_params?: any): void {}

    /** 离开页面 */
    onExit(): void {}

    /** 系统返回/页面返回键；返回 true 表示已处理 */
    onBack(): boolean {
        return false;
    }

    /** 应用进入后台 */
    onAppHide(): void {}

    /** 标准页面头部：返回按钮 + 标题（垂直对齐胶囊按钮，右侧避开胶囊） */
    protected header(title: string, onBack?: () => void, titleX = 0): { title: ReturnType<typeof label>; back: ButtonHandle } {
        const L = this.L;
        const back = button(this.root, {
            w: 84,
            h: 72,
            style: 'white',
            icon: this.gm.textures.icon('back', P.ink),
            iconSize: 30,
            onClick: onBack || (() => this.sm.back()),
        }, -L.w / 2 + Theme.gutter + 42, L.headerY);
        const t = label(this.root, title, Theme.font.title, { bold: true, color: Theme.ink });
        t.node.setPosition(titleX, L.headerY);
        return { title: t, back };
    }
}
