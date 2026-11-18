import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage, SaveManager, SAVE_KEY } from '../../assets/scripts/storage/SaveManager';
import { SAVE_VERSION } from '../../assets/scripts/storage/SaveSchema';
import { CollectionManager } from '../../assets/scripts/collection/CollectionManager';
import { ProgressManager } from '../../assets/scripts/progress/ProgressManager';
import { levelFromXp, xpForLevel } from '../../assets/scripts/progress/ProgressConfig';
import { BOARD_THEMES, HINT_TOKEN_MAX, resolveBoardTheme, SHOP_ITEMS, getShopItem } from '../../assets/scripts/progress/ShopConfig';
import { ShopManager } from '../../assets/scripts/progress/ShopManager';
import { PuzzleManager } from '../../assets/scripts/puzzle/PuzzleManager';

function setup(xp = 0, storage = new MemoryStorage()) {
    const save = new SaveManager(storage, () => 1000);
    const col = new CollectionManager(save, () => 1000);
    const pm = new ProgressManager(save, col, () => new Date('2026-11-18T10:00:00'), () => 2000);
    save.mutate((d) => {
        d.progress.xp = xp;
        d.progress.initialized = true;
    }, true);
    const shop = new ShopManager(save, pm);
    return { storage, save, pm, shop };
}

test('兑换：花经验不会降级，余额 = 累计经验 − 已花费', () => {
    const { shop, pm } = setup(xpForLevel(4)); // 刚好 Lv4
    assert.equal(pm.level().level, 4);
    assert.equal(shop.balance(), xpForLevel(4));
    assert.ok(shop.buy('hint_token').ok);
    assert.equal(shop.balance(), xpForLevel(4) - 30);
    assert.equal(pm.xp(), xpForLevel(4), '累计经验不变');
    assert.equal(pm.level().level, 4, '等级不变');
});

test('兑换：经验不足、等级不够、重复购买都被拒绝，且不扣经验', () => {
    const { shop, save } = setup(40); // Lv2，余额 40
    const spent0 = save.data.progress.shop.spent;
    const poor = shop.buy('theme_mint'); // 需要 Lv3
    assert.equal(poor.ok, false);
    assert.equal(poor.reason, 'level');
    const lowXp = setup(10).shop.buy('hint_token');
    assert.equal(lowXp.reason, 'xp');
    assert.match(lowXp.message, /还差 20/);
    assert.equal(shop.buy('不存在').reason, 'unknown');
    assert.equal(save.data.progress.shop.spent, spent0, '失败的兑换不扣经验');

    const rich = setup(xpForLevel(6));
    assert.ok(rich.shop.buy('theme_mint').ok);
    assert.equal(rich.shop.buy('theme_mint').reason, 'owned');
    assert.equal(rich.save.data.progress.shop.spent, 60, '重复购买不再扣经验');
});

test('等级门槛：每个配色在对应等级才能兑换，价格按等级递增', () => {
    const themes = SHOP_ITEMS.filter((i) => i.kind === 'boardTheme');
    assert.ok(themes.length >= 3);
    for (let i = 1; i < themes.length; i++) {
        assert.ok(themes[i].minLevel > themes[i - 1].minLevel);
        assert.ok(themes[i].cost > themes[i - 1].cost);
    }
    for (const t of themes) {
        const low = setup(xpForLevel(t.minLevel) - 1);
        assert.equal(low.shop.status(t), 'locked', `${t.id} 在 Lv${t.minLevel - 1} 应该锁定`);
        const ok = setup(xpForLevel(t.minLevel) + t.cost);
        assert.equal(ok.shop.status(t), 'buyable');
    }
});

test('升级礼物：每升一级送 1 张提示券，不重复发，老玩家补发，库存封顶', () => {
    const { shop, save } = setup(0);
    assert.equal(shop.hintTokens(), 0, 'Lv1 没有礼物');
    save.mutate((d) => (d.progress.xp = xpForLevel(4)), true); // 升到 Lv4
    assert.equal(shop.hintTokens(), 3, 'Lv2、3、4 各 1 张');
    assert.equal(shop.hintTokens(), 3, '再次读取不会重复发放');
    assert.equal(shop.syncGifts(), 0);
    save.mutate((d) => (d.progress.xp = xpForLevel(30)), true);
    assert.equal(shop.hintTokens(), HINT_TOKEN_MAX, '库存封顶');
    assert.equal(save.data.progress.shop.giftLevel, 30);
    assert.equal(shop.syncGifts(), 0, '封顶后也不会日后再补发');
});

test('提示券：能买、能用，库存满了不能再买，用完返回 false', () => {
    const { shop } = setup(1000);
    // 1000 经验已是较高等级，升级礼物会先补发，再算库存
    const gift = shop.hintTokens();
    assert.ok(gift >= 1);
    assert.ok(shop.buy('hint_token').ok);
    assert.equal(shop.hintTokens(), Math.min(HINT_TOKEN_MAX, gift + 1));
    while (shop.hintTokens() < HINT_TOKEN_MAX) assert.ok(shop.buy('hint_token').ok || shop.balance() < 30);
    if (shop.hintTokens() >= HINT_TOKEN_MAX) assert.equal(shop.buy('hint_token').reason, 'stock_full');
    const n = shop.hintTokens();
    assert.ok(shop.useHintToken());
    assert.equal(shop.hintTokens(), n - 1);
    while (shop.useHintToken());
    assert.equal(shop.useHintToken(), false);
});

test('棋盘配色：买到自动使用，可切回默认，没买过不能装备，存档里的无效值回到默认', () => {
    const { shop, save } = setup(xpForLevel(8) + 500);
    assert.equal(shop.boardTheme(), 'classic');
    assert.equal(shop.equipTheme('sky'), false, '没买过不能装备');
    assert.ok(shop.buy('theme_sky').ok);
    assert.equal(shop.boardTheme(), 'sky');
    assert.ok(shop.buy('theme_mint').ok);
    assert.equal(shop.boardTheme(), 'mint', '最后买的自动使用');
    assert.ok(shop.equipTheme('sky'));
    assert.equal(shop.boardTheme(), 'sky');
    assert.ok(shop.equipTheme('classic'));
    assert.equal(shop.boardTheme(), 'classic');
    save.mutate((d) => (d.progress.shop.boardTheme = 'night'), true); // 存档里写了没买过的配色
    assert.equal(shop.boardTheme(), 'classic');
    save.mutate((d) => (d.progress.shop.boardTheme = '乱写'), true);
    assert.equal(resolveBoardTheme(shop.boardTheme()).fill, BOARD_THEMES.classic.fill);
});

test('存档：兑换数据写入后重启仍在；旧存档（v5，没有 shop）自动补空且进度不丢', () => {
    const a = setup(xpForLevel(5) + 200);
    assert.ok(a.shop.buy('theme_mint').ok);
    assert.ok(a.shop.buy('hint_token').ok);
    a.save.flush();
    const b = setup(0, a.storage);
    const st = b.save.data.progress.shop;
    assert.deepEqual(st.owned, ['theme_mint']);
    assert.equal(st.spent, 90);
    assert.equal(b.save.data.version, SAVE_VERSION);

    // 手写一份没有 shop 字段的旧存档
    const old = new MemoryStorage();
    const s0 = new SaveManager(old, () => 1000);
    s0.mutate((d) => {
        d.progress.xp = 500;
        d.progress.initialized = true;
    }, true);
    const raw = JSON.parse(old.getItem(SAVE_KEY)!);
    raw.version = 5;
    delete raw.progress.shop;
    old.setItem(SAVE_KEY, JSON.stringify(raw));
    const s1 = new SaveManager(old, () => 2000);
    assert.equal(s1.data.progress.xp, 500, '旧经验保留');
    assert.deepEqual(s1.data.progress.shop, { spent: 0, hintTokens: 0, owned: [], boardTheme: 'classic', giftLevel: 1 });
});

test('存档：被篡改的兑换数据会被规范化（负数、超大值、乱类型）', () => {
    const st = new MemoryStorage();
    const s0 = new SaveManager(st, () => 1000);
    s0.flush();
    const raw = JSON.parse(st.getItem(SAVE_KEY)!);
    raw.progress.shop = { spent: -50, hintTokens: 9999, owned: ['theme_sky', 7, null], boardTheme: 42, giftLevel: 0 };
    st.setItem(SAVE_KEY, JSON.stringify(raw));
    const s1 = new SaveManager(st, () => 2000);
    const sh = s1.data.progress.shop;
    assert.equal(sh.spent, 0);
    assert.equal(sh.hintTokens, 99);
    assert.deepEqual(sh.owned, ['theme_sky']);
    assert.equal(sh.boardTheme, 'classic');
    assert.equal(sh.giftLevel, 1);
});

test('提示券换提示：用券后 grantExtraHint 让本局多 1 次提示', () => {
    const { shop } = setup(xpForLevel(3));
    const pm = new PuzzleManager({ imageId: 'cat_orange', grid: 4, seed: 5 });
    while (pm.hintsLeft > 0) assert.ok(pm.useHint());
    assert.equal(pm.hintsLeft, 0);
    assert.ok(shop.hintTokens() >= 1);
    assert.ok(shop.useHintToken());
    pm.grantExtraHint(1);
    assert.equal(pm.hintsLeft, 1);
    assert.ok(pm.useHint());
    assert.equal(pm.hintsLeft, 0);
});

test('商品表：id 唯一、价格为正、配色商品都有对应配色、等级经验换算一致', () => {
    const ids = new Set<string>();
    for (const it of SHOP_ITEMS) {
        assert.ok(!ids.has(it.id), `重复 id ${it.id}`);
        ids.add(it.id);
        assert.ok(it.cost > 0 && it.minLevel >= 1);
        if (it.kind === 'boardTheme') assert.ok(it.theme && BOARD_THEMES[it.id.replace('theme_', '')]);
        assert.equal(getShopItem(it.id), it);
    }
    assert.equal(levelFromXp(xpForLevel(5)).level, 5);
});
