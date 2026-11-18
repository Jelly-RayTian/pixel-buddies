import { Node } from 'cc';
import { P } from '../art/Palette';
import { BOARD_THEMES, HINT_TOKEN_MAX, LEVEL_GIFT_TOKENS, ShopItem, themeKeyOfItem } from '../progress/ShopConfig';
import { ItemStatus } from '../progress/ShopManager';
import { ScrollList } from '../ui/ScrollList';
import { Theme } from '../ui/Theme';
import { button, label, panel, sprite } from '../ui/UIKit';
import { BasePage } from './BasePage';
import { levelBadge } from './GrowthKit';

/**
 * 兑换所：用经验兑换提示券和棋盘配色。
 * 累计经验决定等级、只增不减；兑换只花“可兑换经验”，不会降级。每升一级送 1 张提示券。
 */
export class ShopPage extends BasePage {
    private list!: ScrollList;

    protected build(): void {
        const L = this.L;
        this.header('兑换所');
        const top = L.contentTop - 6;
        const bottom = -L.h / 2 + L.safeBottom + 10;
        this.list = ScrollList.create(this.root, L.w, top - bottom, 0, (top + bottom) / 2);
    }

    onEnter(): void {
        this.refresh();
    }

    private refresh(): void {
        const gm = this.gm;
        const shop = gm.shop;
        const L = this.L;
        const W = L.w - Theme.gutter * 2;
        const c = this.list.content;
        c.destroyAllChildren();
        gm.progress.refresh();
        const info = gm.progress.level();
        const tokens = shop.hintTokens(); // 先补发升级礼物，再读库存
        let y = -14;

        // ---- 余额卡片
        const hh = 190;
        const hero = panel(c, W, hh, { fill: P.white, border: P.ink, shadow: P.rose2, step: Theme.px, shadowDepth: 2 }, 0, y - hh / 2);
        levelBadge(hero, info.level, -W / 2 + 70, 28, 92);
        label(hero, '可兑换经验', Theme.font.tiny, { color: Theme.textMuted, align: 'left', width: W - 260 }).node.setPosition(-W / 2 + 150 + (W - 260) / 2 - (W - 260) / 2, 54);
        label(hero, `${shop.balance()}`, Theme.font.title, { bold: true, color: P.rose2, align: 'left', width: W - 260 }).node.setPosition(-W / 2 + 150, 14);
        label(hero, `累计 ${gm.progress.xp()} · 兑换不会降低等级`, Theme.font.tiny, { color: P.ink2, align: 'left', width: W - 200 }).node.setPosition(-W / 2 + 150, -20);
        const chip = panel(hero, W - 60, 46, { fill: P.butter, border: P.ink, shadow: undefined, step: 3 }, 0, -hh / 2 + 40);
        sprite(chip, gm.textures.icon('bulb', P.gold2, P.white), 30, 30, -(W - 60) / 2 + 32, 0);
        label(chip, `提示券 ×${tokens}（最多 ${HINT_TOKEN_MAX}）· 每升一级送 ${LEVEL_GIFT_TOKENS} 张`, Theme.font.tiny, { bold: true, width: W - 140 }).node.setPosition(14, 0);
        y -= hh + 22;

        // ---- 商品
        for (const item of shop.items()) {
            y -= this.card(c, item, shop.status(item), W, y) + 16;
            // 默认配色不是商品，但买过别的配色后需要有地方切回来：放在第一个配色商品之前
            if (item.kind === 'consumable' && shop.items().some((i) => i.kind === 'boardTheme' && shop.owns(i.id))) {
                const classic: ShopItem = { id: 'theme_classic', kind: 'boardTheme', name: '奶油棋盘', desc: '默认配色，随时可以切回来', cost: 0, minLevel: 1, theme: BOARD_THEMES.classic };
                y -= this.card(c, classic, shop.boardTheme() === 'classic' ? 'equipped' : 'owned', W, y) + 16;
            }
        }
        label(c, '经验来自拼图、每日任务、每周挑战和成就；这里没有任何付费内容', Theme.font.tiny, { color: Theme.textMuted, width: W, wrap: true }).node.setPosition(0, y - 24);
        y -= 60;
        this.list.setContentHeight(-y + 40);
        this.list.scrollToTop();
    }

    /** 画一张商品卡，返回它的高度 */
    private card(c: Node, item: ShopItem, st: ItemStatus, W: number, y: number): number {
        const gm = this.gm;
        const h = 168;
        const locked = st === 'locked';
        const card = panel(c, W, h, { fill: locked ? P.cream : P.white, border: locked ? P.ink2 : P.ink, shadow: Theme.shadow, step: Theme.px, shadowDepth: 1.5 }, 0, y - h / 2);

        // 左侧图示：提示券用灯泡，配色用迷你棋盘
        const ix = -W / 2 + 80;
        if (item.kind === 'boardTheme' && item.theme) {
            const sw = panel(card, 104, 104, { fill: item.theme.fill, border: item.theme.border, shadow: item.theme.border, step: Theme.px, shadowDepth: 1 }, ix, 8);
            for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) panel(sw, 22, 22, { fill: item.theme.slot, shadow: undefined, step: 2 }, (k - 1) * 28, (1 - r) * 28);
        } else {
            const bg = panel(card, 104, 104, { fill: P.butter, border: P.ink, shadow: P.gold2, step: Theme.px, shadowDepth: 1 }, ix, 8);
            sprite(bg, gm.textures.icon('bulb', P.gold2, P.white), 64, 64);
        }

        const tx = -W / 2 + 160;
        const tw = W - 160 - 200;
        label(card, item.name, Theme.font.body, { bold: true, align: 'left', width: tw, color: locked ? Theme.textMuted : Theme.ink }).node.setPosition(tx, h / 2 - 38);
        label(card, item.desc, Theme.font.tiny, { color: Theme.textMuted, align: 'left', width: tw, wrap: true }).node.setPosition(tx, 6);
        const owned = st === 'owned' || st === 'equipped';
        const priceText = owned ? '已拥有' : item.minLevel > 1 && st === 'locked' ? `需 Lv.${item.minLevel} · ${item.cost} 经验` : `${item.cost} 经验`;
        label(card, priceText, Theme.font.small - 2, { bold: true, color: owned ? P.leaf3 : P.rose2, align: 'left', width: tw }).node.setPosition(tx, -h / 2 + 34);

        // 右侧按钮：按状态显示不同动作
        const bw = 170;
        const bx = W / 2 - bw / 2 - 20;
        let text = '兑换';
        let style: 'primary' | 'secondary' | 'white' | 'mint' = 'primary';
        let enabled = true;
        let action: () => void = () => this.buy(item);
        switch (st) {
            case 'locked':
                text = `Lv.${item.minLevel} 解锁`;
                style = 'white';
                action = () => this.sm.toast(`再升到 Lv.${item.minLevel} 就能兑换`);
                break;
            case 'poor':
                text = '经验不足';
                style = 'white';
                action = () => this.sm.toast(`还差 ${item.cost - gm.shop.balance()} 点经验`);
                break;
            case 'full':
                text = '已存满';
                style = 'white';
                action = () => this.sm.toast(`提示券最多存 ${HINT_TOKEN_MAX} 张`);
                break;
            case 'owned':
                text = '使用';
                style = 'mint';
                action = () => this.equip(item);
                break;
            case 'equipped':
                text = '使用中';
                style = 'secondary';
                enabled = false;
                break;
            default:
                break;
        }
        const b = button(card, { w: bw, h: 80, text, style, fontSize: Theme.font.small, onClick: action }, bx, -4);
        b.setEnabled(enabled);
        return h;
    }

    private buy(item: ShopItem): void {
        const gm = this.gm;
        const r = gm.shop.buy(item.id);
        this.sm.toast(r.message);
        if (!r.ok) return;
        gm.audio.play('star', 0.8);
        gm.analytics.track('shop_purchase', { item: item.id });
        this.refresh();
    }

    private equip(item: ShopItem): void {
        const key = themeKeyOfItem(item.id);
        if (this.gm.shop.equipTheme(key)) {
            this.gm.audio.play('click');
            this.sm.toast(`已使用「${BOARD_THEMES[key] ? BOARD_THEMES[key].name : item.name}」`);
            this.refresh();
        }
    }
}
