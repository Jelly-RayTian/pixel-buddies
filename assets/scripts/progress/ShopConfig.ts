import { P } from '../art/Palette';

/**
 * 兑换所配置（纯数据，不依赖 cc）。
 *
 * 经验的两个用途：
 * - 累计经验决定等级（只增不减）；
 * - 同时可以拿去兑换：花掉的经验记在 shop.spent，余额 = 累计经验 − 已花费，兑换不会降级。
 * 升级的作用：每升一级送 1 张提示券；部分商品要到指定等级才能兑换。
 * 这里没有任何付费内容，也不涉及真实货币。
 */

export type ShopKind = 'consumable' | 'boardTheme';

export interface BoardThemeColors {
    /** 棋盘底板 */
    fill: number;
    /** 格子底槽（半透明叠加） */
    slot: number;
    /** 描边与阴影 */
    border: number;
}

export interface ShopItem {
    id: string;
    kind: ShopKind;
    name: string;
    desc: string;
    /** 经验价格 */
    cost: number;
    /** 需要的最低等级 */
    minLevel: number;
    /** 消耗品的库存上限 */
    maxStock?: number;
    /** 棋盘配色 */
    theme?: BoardThemeColors;
}

/** 默认棋盘配色：不用兑换，随时可以切回 */
export const DEFAULT_BOARD_THEME = 'classic';

export const BOARD_THEMES: Record<string, BoardThemeColors & { name: string }> = {
    classic: { name: '奶油', fill: P.cream2, slot: P.cream3, border: P.ink },
    mint: { name: '薄荷', fill: P.mint, slot: P.mint2, border: P.leaf3 },
    sky: { name: '天空', fill: P.sky, slot: P.sky2, border: P.blue3 },
    lilac: { name: '丁香', fill: P.lilac, slot: P.lilac2, border: P.purple2 },
    night: { name: '夜幕', fill: P.night3, slot: P.night2, border: P.night },
};

export const HINT_TOKEN_ID = 'hint_token';
export const HINT_TOKEN_MAX = 9;
/** 每升一级送的提示券数 */
export const LEVEL_GIFT_TOKENS = 1;

export const SHOP_ITEMS: ShopItem[] = [
    { id: HINT_TOKEN_ID, kind: 'consumable', name: '提示券', desc: '免费提示用完后，可换 1 次提示（算作用过提示）', cost: 30, minLevel: 1, maxStock: HINT_TOKEN_MAX },
    { id: 'theme_mint', kind: 'boardTheme', name: '薄荷棋盘', desc: '清爽的薄荷绿底板', cost: 60, minLevel: 3, theme: BOARD_THEMES.mint },
    { id: 'theme_sky', kind: 'boardTheme', name: '天空棋盘', desc: '晴天一样的浅蓝底板', cost: 100, minLevel: 5, theme: BOARD_THEMES.sky },
    { id: 'theme_lilac', kind: 'boardTheme', name: '丁香棋盘', desc: '柔和的淡紫底板', cost: 150, minLevel: 8, theme: BOARD_THEMES.lilac },
    { id: 'theme_night', kind: 'boardTheme', name: '夜幕棋盘', desc: '深色底板，像素画会更显眼', cost: 220, minLevel: 12, theme: BOARD_THEMES.night },
];

const BY_ID: Record<string, ShopItem> = {};
for (const it of SHOP_ITEMS) BY_ID[it.id] = it;

export function getShopItem(id: string): ShopItem | undefined {
    return BY_ID[id];
}

/** 配色 id（theme_mint 等商品 id → 配色名 mint）；未知或没有时回到默认 */
export function themeKeyOfItem(itemId: string): string {
    return itemId.startsWith('theme_') ? itemId.slice(6) : DEFAULT_BOARD_THEME;
}

/** 配色名 → 商品 id（classic 没有对应商品） */
export function itemIdOfTheme(themeKey: string): string | null {
    return themeKey === DEFAULT_BOARD_THEME ? null : `theme_${themeKey}`;
}

export function resolveBoardTheme(themeKey: string): BoardThemeColors {
    return BOARD_THEMES[themeKey] || BOARD_THEMES[DEFAULT_BOARD_THEME];
}
