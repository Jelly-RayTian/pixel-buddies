import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage, SaveManager } from '../../assets/scripts/storage/SaveManager';
import { CollectionManager } from '../../assets/scripts/collection/CollectionManager';
import { ProgressManager } from '../../assets/scripts/progress/ProgressManager';
import { ACHIEVEMENTS } from '../../assets/scripts/progress/ProgressConfig';
import { EXTREME, isExtremeKey, isExtremeUnlocked, recordKeyFor } from '../../assets/scripts/config/GameConfig';
import { ART_LIST } from '../../assets/scripts/art/ArtCatalog';
import { SeededRandom } from '../../assets/scripts/core/Random';
import { fullShuffle as shuffleFull, generateLayout } from '../../assets/scripts/puzzle/PuzzleGenerator';
import { PuzzleManager } from '../../assets/scripts/puzzle/PuzzleManager';
import { computeStars, PuzzleResult } from '../../assets/scripts/puzzle/PuzzleScoring';
import { countFixedPoints, isPermutation, minSwapsToSolve } from '../../assets/scripts/puzzle/PuzzleValidator';

const res = (imageId: string, grid: 3 | 4 | 5 | 6, extreme = false, timeMs = 20000): PuzzleResult => ({
    imageId,
    grid,
    seed: 1,
    timeMs,
    moves: grid * grid - 2,
    hintsUsed: 0,
    peekCount: 0,
    undoCount: 0,
    optimalMoves: grid * grid - 2,
    extreme: extreme ? true : undefined,
});

function setup() {
    const save = new SaveManager(new MemoryStorage(), () => 1000);
    const col = new CollectionManager(save, () => 1000);
    const pm = new ProgressManager(save, col, () => new Date('2026-11-16T10:00:00'), () => 2000);
    const play = (r: PuzzleResult) => pm.onPuzzleCompleted({ result: r, rec: col.recordResult(r), mode: 'classic' });
    return { save, col, pm, play };
}

test('整盘打乱：任意种子、任意大小都没有固定点，是合法排列，且一定有解', () => {
    for (const n of [4, 9, 16, 25, 36]) {
        for (let seed = 1; seed <= 400; seed++) {
            const order = shuffleFull(n, new SeededRandom(seed));
            assert.ok(isPermutation(order, n), `n=${n} seed=${seed} 不是排列`);
            assert.equal(countFixedPoints(order), 0, `n=${n} seed=${seed} 仍有送分方块`);
            assert.ok(minSwapsToSolve(order) >= Math.ceil(n / 2), '没有固定点时至少需要 n/2 次交换');
        }
    }
});

test('整盘打乱：同一个种子结果完全一致（确定性）', () => {
    const a = shuffleFull(36, new SeededRandom(2026));
    const b = shuffleFull(36, new SeededRandom(2026));
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, shuffleFull(36, new SeededRandom(2027)));
});

test('极限布局：36 块全部错位，最少步数与实际打乱一致；普通布局不受影响', () => {
    const lay = generateLayout({ imageId: 'cat_orange', grid: 6, seed: 7, extreme: true });
    assert.equal(lay.extreme, true);
    assert.equal(countFixedPoints(lay.order), 0);
    assert.equal(lay.swaps, minSwapsToSolve(lay.order));
    const normal = generateLayout({ imageId: 'cat_orange', grid: 6, seed: 7 });
    assert.equal(normal.extreme, undefined);
    assert.equal(36 - countFixedPoints(normal.order), 18, '普通困难仍是 18 块错位');
});

test('极限规则：提示只有 1 次，偷看最多 3 次；普通模式提示 4 次、偷看不限', () => {
    const ex = new PuzzleManager({ imageId: 'cat_orange', grid: 6, seed: 3, extreme: true });
    assert.equal(ex.extreme, true);
    assert.equal(ex.hintsLeft, EXTREME.freeHints);
    assert.equal(ex.peeksLeft, EXTREME.maxPeeks);
    assert.ok(ex.useHint());
    assert.equal(ex.hintsLeft, 0);
    assert.equal(ex.useHint(), null, '第二次提示被拒绝');
    for (let i = 0; i < EXTREME.maxPeeks; i++) ex.recordPeek();
    assert.equal(ex.peeksLeft, 0);
    assert.equal(ex.getResult().extreme, true);

    const normal = new PuzzleManager({ imageId: 'cat_orange', grid: 6, seed: 3 });
    assert.equal(normal.hintsLeft, 4);
    assert.equal(normal.peeksLeft, Infinity);
    assert.equal(normal.getResult().extreme, undefined);
});

test('极限模式：能一步步换回原图（按提示一直走完必定通关）', () => {
    const pm = new PuzzleManager({ imageId: 'cat_orange', grid: 6, seed: 11, extreme: true });
    let guard = 0;
    while (!pm.finished && guard++ < 100) {
        const h = pm.peekHint()!;
        assert.ok(h);
        assert.ok(pm.trySwap(h.fromCell, h.toCell).swapped);
    }
    assert.ok(pm.finished);
    assert.ok(pm.moves <= pm.optimalMoves + 0, '按提示走就是最少步数');
});

test('极限星级：使用独立阈值，比普通 6×6 更严', () => {
    const base = { grid: 6 as const, moves: 34, hintsUsed: 0, optimalMoves: 34 };
    // 280 秒：普通困难（三星 210s）只有两星，极限（三星 300s）拿三星——阈值各自独立
    assert.equal(computeStars({ ...base, timeMs: 280_000 }).stars, 2);
    assert.equal(computeStars({ ...base, timeMs: 280_000, extreme: true }).stars, 3);
    // 步数：极限三星步数上限 = ceil(34 × 1.25) = 43
    assert.equal(computeStars({ ...base, moves: 43, timeMs: 100_000, extreme: true }).stars, 3);
    assert.equal(computeStars({ ...base, moves: 44, timeMs: 100_000, extreme: true }).stars, 2);
    assert.equal(computeStars({ ...base, moves: 60, timeMs: 100_000, extreme: true }).stars, 1);
    // 提示上限仍然生效
    assert.equal(computeStars({ ...base, hintsUsed: 1, timeMs: 100_000, extreme: true }).stars, 2);
});

test('纪录隔离：极限成绩存独立键，不覆盖普通 6×6，也不计入总星数', () => {
    const { col, save } = setup();
    col.recordResult(res('cat_orange', 6));
    const starsBefore = col.totalStars();
    const rec = col.recordResult(res('cat_orange', 6, true));
    assert.equal(rec.previousBest, null, '极限的“上一次纪录”不是普通 6×6 的成绩');
    assert.ok(save.data.records['cat_orange'][EXTREME.recordKey]);
    assert.ok(save.data.records['cat_orange']['6']);
    assert.equal(col.totalStars(), starsBefore, '极限星星不计入总星数（不影响图片解锁）');
    assert.equal(col.getRecord('cat_orange', 6)!.completions, 1);
    assert.equal(col.getExtremeRecord('cat_orange')!.completions, 1);
    assert.equal(col.extremeClearedCount(), 1);
});

test('解锁：完成过 5×5 或 6×6 才能玩极限；极限本身和 3×3/4×4 不算', () => {
    const { col } = setup();
    assert.equal(isExtremeUnlocked(col.bigGridCompletions()), false);
    col.recordResult(res('cat_orange', 3));
    col.recordResult(res('cat_orange', 4));
    assert.equal(isExtremeUnlocked(col.bigGridCompletions()), false);
    col.recordResult(res('cat_orange', 5));
    assert.equal(col.bigGridCompletions(), 1);
    assert.equal(isExtremeUnlocked(col.bigGridCompletions()), true);
    const other = setup();
    other.col.recordResult(res('cat_orange', 6, true));
    assert.equal(other.col.bigGridCompletions(), 0, '极限成绩不会替自己解锁');
});

test('极限经验：首次通关发放 EXTREME.xp，重复通关同一张图不再刷经验', () => {
    const { pm, play } = setup();
    const first = play(res('cat_orange', 6, true));
    assert.ok(first.xpGained >= EXTREME.xp, `首次应至少 ${EXTREME.xp}，实际 ${first.xpGained}`);
    const again = play(res('cat_orange', 6, true));
    assert.equal(again.xpGained, 0);
    // 普通 6×6 的经验键与极限互不影响：同一张图的普通 6×6 仍然能拿到第一次的经验
    const normal = play(res('cat_orange', 6));
    assert.ok(normal.xpGained >= 50);
    assert.ok(pm.xp() >= EXTREME.xp + 50);
});

test('极限成就：通关 1 件解锁“极限挑战者”，3 件解锁“极限收藏家”', () => {
    const { pm, play } = setup();
    assert.ok(ACHIEVEMENTS.find((a) => a.id === 'extreme_1'));
    const fresh1 = play(res(ART_FIRST, 6, true)).achievements.map((a) => a.id);
    assert.ok(fresh1.includes('extreme_1'));
    assert.ok(!fresh1.includes('extreme_3'));
    play(res(ART_SECOND, 6, true));
    const fresh3 = play(res(ART_THIRD, 6, true)).achievements.map((a) => a.id);
    assert.ok(fresh3.includes('extreme_3'));
    assert.equal(pm.achievementStats().extremeCleared, 3);
});

test('纪录键工具：只有极限键被识别为极限；普通难度键是纯数字', () => {
    assert.equal(recordKeyFor(6), '6');
    assert.equal(recordKeyFor(6, true), EXTREME.recordKey);
    assert.equal(isExtremeKey(EXTREME.recordKey), true);
    for (const g of ['3', '4', '5', '6']) assert.equal(isExtremeKey(g), false);
    assert.ok(Number.isNaN(parseInt(EXTREME.recordKey, 10)), '极限键不会被误当作网格数');
});

const ART_FIRST = ART_LIST[0].id;
const ART_SECOND = ART_LIST[1].id;
const ART_THIRD = ART_LIST[2].id;
