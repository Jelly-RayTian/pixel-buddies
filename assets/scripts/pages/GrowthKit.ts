import { Node, tween, Vec3 } from 'cc';
import { P } from '../art/Palette';
import { GameManager } from '../core/GameManager';
import { AchievementDef, LevelInfo } from '../progress/ProgressConfig';
import { ClaimResult } from '../progress/ProgressManager';
import { Theme } from '../ui/Theme';
import { button, label, makeNode, panel, popIn, sprite } from '../ui/UIKit';

/** 经验条：级内进度（连续条，不分段） */
export function xpBar(parent: Node, info: LevelInfo, w: number, x: number, y: number, color: number = P.rose): Node {
    const n = panel(parent, w, 22, { fill: P.cream3, border: P.ink, shadow: undefined, step: 3 }, x, y);
    const fw = Math.max(0, Math.min(1, info.ratio)) * (w - 8);
    if (fw > 0) panel(n, fw, 14, { fill: color, shadow: undefined, step: 2 }, -(w - 8) / 2 + fw / 2, 0);
    return n;
}

/** 数字等级徽章 */
export function levelBadge(parent: Node, level: number, x: number, y: number, size = 76): Node {
    const n = panel(parent, size, size, { fill: P.rose, border: P.ink, shadow: P.rose2, step: Theme.px }, x, y);
    label(n, `Lv.${level}`, size > 70 ? Theme.font.body : Theme.font.small, { bold: true, color: P.white, outline: { color: P.ink, width: 3 } });
    return n;
}

/** 红点 */
export function redDot(parent: Node, x: number, y: number, size = 24): Node {
    const n = panel(parent, size, size, { fill: P.rose, border: P.white, shadow: undefined, step: 3 }, x, y);
    return n;
}

function sparkles(card: Node, cx: number, cy: number, spread: number): void {
    const gm = GameManager.I;
    const pts = [[-spread, 40], [spread, 10], [-spread + 30, -80], [spread - 20, -90]];
    pts.forEach(([x, y], i) => {
        const sp = sprite(card, gm.textures.icon('sparkle', i % 2 ? P.gold : P.rose, P.white), 32, 32, cx + x, cy + y);
        tween(sp.node).repeatForever(tween().to(0.5 + i * 0.1, { scale: new Vec3(1.35, 1.35, 1) }).to(0.5 + i * 0.1, { scale: new Vec3(0.8, 0.8, 1) })).start();
    });
}

/** 升级庆祝弹窗（含分享）。一次只会调用一次，不叠加其它弹窗 */
export function showLevelUp(level: number, title: string | null, onClose?: () => void): void {
    const gm = GameManager.I;
    const sm = gm.scene;
    if (sm.hasModal) return;
    const w = Math.min(gm.layout.w - 48, 620);
    const h = 640;
    const card = sm.openModal(w, h, { closeOnMask: false, onClose });
    const ribbon = panel(card, w - 120, 76, { fill: P.rose, border: P.ink, shadow: P.rose2, step: Theme.px }, 0, h / 2 - 58);
    label(ribbon, '升级啦！', Theme.font.h2, { bold: true, color: P.white });
    const badge = levelBadge(card, level, 0, h / 2 - 230, 190);
    badge.setScale(0.4, 0.4, 1);
    tween(badge).to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    sparkles(card, 0, h / 2 - 230, 230);
    const t = GameManager.I.progress.title();
    label(card, title ? `新称号：${title}` : t, Theme.font.h2, { bold: true, color: P.rose2, width: w - 60 }).node.setPosition(0, h / 2 - 380);
    const info = gm.progress.level();
    const gift = gm.shop.syncGifts();
    label(card, gift > 0 ? `升级礼物：提示券 +${gift} · 下一级还需 ${info.need - info.into} 点经验` : `距离下一级还需 ${info.need - info.into} 点经验`, Theme.font.small, { color: P.ink2, width: w - 60 }).node.setPosition(0, h / 2 - 430);
    button(card, {
        w: w - 100, h: 88, text: '分享升级', style: 'primary', icon: gm.textures.icon('share', P.white),
        onClick: () => {
            const art = gm.collection.latestUnlocked();
            gm.share.shareCardOf('levelup', {
                artId: art ? art.id : 'cat_orange', title: `升到 Lv.${level}`, subtitle: gm.progress.title(), stars: 0,
                lines: [`收藏 ${gm.collection.overall().collected}/${gm.collection.overall().total}`, `成就 ${gm.progress.achievementsView().filter((a) => a.unlocked).length}/${gm.progress.achievementsView().length}`],
                footer: '一起来拼像素画吧！', text: `我在《像素搭子》升到了 Lv.${level}「${gm.progress.title()}」`,
            }).then((r) => sm.toast(r.message));
        },
    }, 0, -h / 2 + 150);
    button(card, { w: w - 100, h: 80, text: '继续', style: 'secondary', onClick: () => sm.closeModal() }, 0, -h / 2 + 50);
    gm.audio.play('star', 0.9);
    gm.vibrate();
    popIn(card, 0, 10);
}

/** 成就解锁弹窗（可分享） */
export function showAchievementUnlocked(defs: AchievementDef[], onClose?: () => void): void {
    const gm = GameManager.I;
    const sm = gm.scene;
    if (sm.hasModal || !defs.length) return;
    const w = Math.min(gm.layout.w - 48, 620);
    const h = 600;
    const card = sm.openModal(w, h, { closeOnMask: false, onClose });
    const a = defs[0];
    const ribbon = panel(card, w - 120, 76, { fill: P.butter, border: P.ink, shadow: P.gold2, step: Theme.px }, 0, h / 2 - 58);
    label(ribbon, defs.length > 1 ? `解锁 ${defs.length} 个成就！` : '解锁新成就！', Theme.font.h2, { bold: true });
    const ic = panel(card, 170, 170, { fill: P.white, border: P.ink, shadow: P.gold2, step: Theme.px }, 0, h / 2 - 220);
    sprite(ic, gm.textures.icon(a.icon, P.gold2, P.white), 92, 92);
    ic.setScale(0.4, 0.4, 1);
    tween(ic).to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    sparkles(card, 0, h / 2 - 220, 220);
    label(card, a.title, Theme.font.title, { bold: true, width: w - 60 }).node.setPosition(0, h / 2 - 360);
    label(card, defs.length > 1 ? `${a.desc}\n另有 ${defs.length - 1} 个，可在“任务与成就”查看` : a.desc, Theme.font.small, { color: P.ink2, width: w - 80, wrap: true }).node.setPosition(0, h / 2 - 430);
    button(card, {
        w: w - 100, h: 88, text: '去领取奖励', style: 'primary', icon: gm.textures.icon('trophy', P.white),
        onClick: () => { sm.closeModal(); sm.go('goals', { tab: 'achievements' }); },
    }, 0, -h / 2 + 150);
    button(card, { w: w - 100, h: 80, text: '继续', style: 'secondary', onClick: () => sm.closeModal() }, 0, -h / 2 + 50);
    gm.audio.play('star', 0.8);
}

/** 周挑战完成弹窗 */
export function showWeeklyComplete(onClose?: () => void): void {
    const gm = GameManager.I;
    const sm = gm.scene;
    if (sm.hasModal) return;
    const wv = gm.progress.weeklyView();
    const w = Math.min(gm.layout.w - 48, 620);
    const h = 660;
    const card = sm.openModal(w, h, { closeOnMask: false, onClose });
    const color = wv.challenge.theme.reward.color;
    const ribbon = panel(card, w - 120, 76, { fill: color, border: P.ink, shadow: P.ink2, step: Theme.px }, 0, h / 2 - 58);
    label(ribbon, '本周挑战完成！', Theme.font.h2, { bold: true, color: P.white, outline: { color: P.ink, width: 3 } });
    const ic = panel(card, 190, 190, { fill: P.white, border: P.ink, shadow: color, step: Theme.px }, 0, h / 2 - 240);
    sprite(ic, gm.textures.icon('crown', color, P.white), 110, 70);
    ic.setScale(0.4, 0.4, 1);
    tween(ic).to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    sparkles(card, 0, h / 2 - 240, 230);
    label(card, `「${wv.challenge.theme.name}」周`, Theme.font.title, { bold: true, width: w - 60 }).node.setPosition(0, h / 2 - 390);
    label(card, `累计完成 ${wv.history.length} 个周挑战\n到“任务与成就”领取周奖励`, Theme.font.small, { color: P.ink2, width: w - 80, wrap: true }).node.setPosition(0, h / 2 - 460);
    button(card, {
        w: w - 100, h: 88, text: '领取周奖励', style: 'primary', icon: gm.textures.icon('trophy', P.white),
        onClick: () => { sm.closeModal(); sm.go('goals', { tab: 'weekly' }); },
    }, 0, -h / 2 + 150);
    button(card, {
        w: w - 100, h: 80, text: '分享', style: 'secondary', icon: gm.textures.icon('share', P.ink),
        onClick: () => {
            gm.share.shareCardOf('weekly', {
                artId: wv.challenge.theme.cover, title: `${wv.challenge.theme.name}周挑战`, subtitle: wv.challenge.weekKey, stars: 3,
                lines: ['本周挑战全部完成', `累计 ${wv.history.length} 周`], footer: '你也来试试！', text: `我完成了《像素搭子》本周「${wv.challenge.theme.name}」挑战`,
            }).then((r) => sm.toast(r.message));
        },
    }, 0, -h / 2 + 50);
    gm.audio.play('star', 0.9);
}

/** 处理领取结果：成功提示 +XP，若升级则弹升级窗 */
export function handleClaim(res: ClaimResult, after?: () => void): void {
    const gm = GameManager.I;
    if (!res.ok) {
        gm.scene.toast('已经领取过啦');
        return;
    }
    gm.audio.play('star', 0.6);
    gm.scene.toast(`经验 +${res.xp}`, 1.2);
    if (res.levelAfter > res.levelBefore) {
        gm.analytics.track('level_up', { level: res.levelAfter });
        showLevelUp(res.levelAfter, res.newTitle, after);
    } else if (after) after();
}

export { makeNode };
