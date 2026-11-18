import { SaveManager } from '../storage/SaveManager';
import { ShopState } from '../storage/SaveSchema';
import { DEFAULT_BOARD_THEME, getShopItem, HINT_TOKEN_ID, HINT_TOKEN_MAX, itemIdOfTheme, LEVEL_GIFT_TOKENS, SHOP_ITEMS, ShopItem, themeKeyOfItem } from './ShopConfig';

/** 兑换所需要从成长系统读取的两个数（ProgressManager 满足它） */
export interface XpSource {
    xp(): number;
    level(): { level: number };
}

export type BuyFailure = 'unknown' | 'level' | 'xp' | 'owned' | 'stock_full';

export interface BuyResult {
    ok: boolean;
    reason?: BuyFailure;
    /** 给玩家看的一句话 */
    message: string;
}

export type ItemStatus = 'locked' | 'poor' | 'buyable' | 'owned' | 'equipped' | 'full';

/**
 * 兑换所（纯逻辑，基于 SaveManager，可在 Node 中单测）。
 * 规则：
 * - 累计经验只增不减（等级由它决定）；兑换只增加 shop.spent，余额 = 累计经验 − 已花费，所以不会降级；
 * - 每升一级送 1 张提示券，按“已发放的最高等级”记账，不会重复发，也会给老玩家补发；
 * - 商品有等级门槛；棋盘配色买一次永久拥有，可随时切换；提示券有库存上限。
 */
export class ShopManager {
    constructor(private readonly save: SaveManager, private readonly progress: XpSource) {}

    private get s(): ShopState {
        return this.save.data.progress.shop;
    }

    level(): number {
        return this.progress.level().level;
    }

    /** 可兑换的经验余额 */
    balance(): number {
        return Math.max(0, this.progress.xp() - this.s.spent);
    }

    /**
     * 补发升级礼物：每升一级送 LEVEL_GIFT_TOKENS 张提示券（库存满了就不再增加，但等级照记，避免日后一次性补发）。
     * 返回这次新增的提示券张数。
     */
    syncGifts(): number {
        const lv = this.level();
        if (lv <= this.s.giftLevel) return 0;
        const levels = lv - this.s.giftLevel;
        const before = this.s.hintTokens;
        this.save.mutate(() => {
            this.s.hintTokens = Math.min(HINT_TOKEN_MAX, before + levels * LEVEL_GIFT_TOKENS);
            this.s.giftLevel = lv;
        }, true);
        return this.s.hintTokens - before;
    }

    hintTokens(): number {
        this.syncGifts();
        return this.s.hintTokens;
    }

    /** 用掉 1 张提示券；没有则返回 false */
    useHintToken(): boolean {
        this.syncGifts();
        if (this.s.hintTokens <= 0) return false;
        this.save.mutate(() => {
            this.s.hintTokens -= 1;
        }, true);
        return true;
    }

    owns(itemId: string): boolean {
        return this.s.owned.indexOf(itemId) >= 0;
    }

    /** 正在使用的棋盘配色；存档里的值无效（例如没买过）时回到默认 */
    boardTheme(): string {
        const t = this.s.boardTheme;
        if (t === DEFAULT_BOARD_THEME) return t;
        const id = itemIdOfTheme(t);
        return id && this.owns(id) ? t : DEFAULT_BOARD_THEME;
    }

    status(item: ShopItem): ItemStatus {
        if (item.kind === 'boardTheme') {
            if (this.owns(item.id)) return this.boardTheme() === themeKeyOfItem(item.id) ? 'equipped' : 'owned';
        } else if (item.maxStock !== undefined && this.hintTokens() >= item.maxStock) {
            return 'full';
        }
        if (this.level() < item.minLevel) return 'locked';
        return this.balance() >= item.cost ? 'buyable' : 'poor';
    }

    buy(itemId: string): BuyResult {
        const item = getShopItem(itemId);
        if (!item) return { ok: false, reason: 'unknown', message: '没有这件商品' };
        if (item.kind === 'boardTheme' && this.owns(item.id)) return { ok: false, reason: 'owned', message: '已经拥有了' };
        if (item.kind === 'consumable' && item.maxStock !== undefined && this.hintTokens() >= item.maxStock) {
            return { ok: false, reason: 'stock_full', message: `最多存 ${item.maxStock} 张` };
        }
        if (this.level() < item.minLevel) return { ok: false, reason: 'level', message: `需要 Lv.${item.minLevel}` };
        if (this.balance() < item.cost) return { ok: false, reason: 'xp', message: `经验不足，还差 ${item.cost - this.balance()}` };
        this.save.mutate(() => {
            this.s.spent += item.cost;
            if (item.kind === 'consumable' && item.id === HINT_TOKEN_ID) this.s.hintTokens += 1;
            else if (item.kind === 'boardTheme') {
                this.s.owned.push(item.id);
                this.s.boardTheme = themeKeyOfItem(item.id); // 买到就直接用上
            }
        }, true);
        return { ok: true, message: item.kind === 'boardTheme' ? `已兑换「${item.name}」，已自动使用` : `已兑换 ${item.name}` };
    }

    /** 切换棋盘配色（默认配色随时可选，其他必须已拥有） */
    equipTheme(themeKey: string): boolean {
        if (themeKey !== DEFAULT_BOARD_THEME) {
            const id = itemIdOfTheme(themeKey);
            if (!id || !this.owns(id)) return false;
        }
        this.save.mutate(() => {
            this.s.boardTheme = themeKey;
        }, true);
        return true;
    }

    /** 全部商品（按配置顺序） */
    items(): ShopItem[] {
        return SHOP_ITEMS;
    }

    /** 当前有没有“已解锁等级、经验也够”的商品（用于红点） */
    hasAffordable(): boolean {
        return SHOP_ITEMS.some((it) => this.status(it) === 'buyable');
    }
}
