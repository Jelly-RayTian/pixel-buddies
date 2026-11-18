import { P } from '../art/Palette';
import { formatDuration } from '../core/GameTimer';
import { ScrollList } from '../ui/ScrollList';
import { Theme } from '../ui/Theme';
import { button, label, panel, sprite } from '../ui/UIKit';
import { BasePage } from './BasePage';
import { levelBadge, redDot, xpBar } from './GrowthKit';

/** 个人资料：等级/称号/经验、统计、分享名片，以及设置/记录入口。不需要注册，不上传任何信息 */
export class ProfilePage extends BasePage {
    private list!: ScrollList;

    protected build(): void {
        const L = this.L;
        this.header('我的资料');
        const top = L.contentTop - 6;
        const bottom = -L.h / 2 + L.safeBottom + 10;
        this.list = ScrollList.create(this.root, L.w, top - bottom, 0, (top + bottom) / 2);
    }

    onEnter(): void {
        this.refresh();
    }

    private refresh(): void {
        const gm = this.gm;
        const L = this.L;
        const W = L.w - Theme.gutter * 2;
        const c = this.list.content;
        c.destroyAllChildren();
        gm.progress.refresh();
        const info = gm.progress.level();
        const ov = gm.collection.overall();
        const stats = gm.progress.achievementStats();
        const ach = gm.progress.achievementsView();
        const unlocked = ach.filter((a) => a.unlocked).length;
        let y = -14;

        // ---- 头部名片
        const hh = 250;
        const hero = panel(c, W, hh, { fill: P.white, border: P.ink, shadow: P.rose2, step: Theme.px, shadowDepth: 2 }, 0, y - hh / 2);
        const frame = gm.collection.earnedRewards()[0];
        const av = panel(hero, 120, 120, { fill: P.peach, border: frame ? frame.reward.color : P.ink, shadow: P.orange2, step: Theme.px }, -W / 2 + 100, 36);
        sprite(av, gm.textures.art('cat_orange'), 88, 88);
        label(hero, gm.save.data.player.nickname, Theme.font.h2, { bold: true, align: 'left', width: W - 330 }).node.setPosition(-W / 2 + 190 + (W - 330) / 2 - (W - 330) / 2 + 0, 62);
        const chip = panel(hero, 220, 46, { fill: P.butter, border: P.ink, shadow: undefined, step: 3 }, -W / 2 + 190 + 110, 8);
        label(chip, gm.progress.title(), Theme.font.small, { bold: true });
        levelBadge(hero, info.level, W / 2 - 80, 62, 92);
        label(hero, `经验 ${info.into}/${info.need} · 总计 ${gm.progress.xp()}`, Theme.font.tiny, { color: P.ink2, bold: true, align: 'left', width: W - 80 }).node.setPosition(-W / 2 + 40 + (W - 80) / 2 - (W - 80) / 2 + 0, -58);
        xpBar(hero, info, W - 80, 0, -92);
        y -= hh + 22;

        // ---- 统计宫格（2 列 × 3 行）
        const cells: Array<[string, string, string, number]> = [
            ['puzzle', '完成拼图', `${stats.puzzlesCompleted} 局`, P.mint3],
            ['star', '三星次数', `${stats.threeStars} 次`, P.gold2],
            ['book', '我的收藏', `${ov.collected}/${ov.total}`, P.purple],
            ['trophy', '成就', `${unlocked}/${ach.length}`, P.rose2],
            ['flame', '每日连续', `${gm.daily.streak()} 天`, P.orange3],
            ['users', '好友挑战', `${stats.friendChallenges} 场 · ${stats.friendWins} 胜`, P.blue3],
        ];
        const gap = 16;
        const cw = (W - gap) / 2;
        const ch = 108;
        cells.forEach((cell, i) => {
            const x = (i % 2 === 0 ? -1 : 1) * (cw / 2 + gap / 2);
            const yy = y - ch / 2 - Math.floor(i / 2) * (ch + gap);
            const p = panel(c, cw, ch, { fill: P.white, border: P.cream3, shadow: Theme.shadow, step: Theme.px, shadowDepth: 1.5 }, x, yy);
            sprite(p, gm.textures.icon(cell[0], cell[3], P.white), 42, 42, -cw / 2 + 48, 0);
            label(p, cell[1], Theme.font.tiny, { color: Theme.textMuted, align: 'left', width: cw - 110 }).node.setPosition(-cw / 2 + 84 + (cw - 110) / 2 - (cw - 110) / 2, 22);
            label(p, cell[2], Theme.font.body, { bold: true, align: 'left', width: cw - 110 }).node.setPosition(-cw / 2 + 84, -18);
        });
        y -= 3 * (ch + gap) + 10;

        // ---- 按钮
        const best = this.bestDaily();
        const bh = 92;
        const mk = (text: string, style: 'primary' | 'butter' | 'mint' | 'white', icon: string, on: () => void, dot = false) => {
            const b = button(c, { w: W, h: bh, text, style, icon: gm.textures.icon(icon, style === 'primary' ? P.white : P.ink), onClick: on }, 0, y - bh / 2);
            if (dot) redDot(b.node, W / 2 - 18, bh / 2 - 14, 26);
            y -= bh + 16;
        };
        mk('分享我的名片', 'primary', 'share', () => this.shareProfile());
        mk('任务与成就', 'butter', 'trophy', () => this.sm.go('goals'), gm.progress.claimableCount() > 0);
        mk(`兑换所 · 可兑换 ${gm.shop.balance()} 经验 · 提示券 ×${gm.shop.hintTokens()}`, 'primary', 'star', () => this.sm.go('shop'), gm.shop.hasAffordable());
        mk('挑战记录与排行', 'mint', 'users', () => this.sm.go('history'));
        // 设置 + 意见反馈并排：公测期让反馈入口离首页只有两步
        const hw = (W - 16) / 2;
        button(c, { w: hw, h: bh, text: '设置', style: 'white', icon: gm.textures.icon('gear', P.ink), onClick: () => this.sm.go('settings') }, -hw / 2 - 8, y - bh / 2);
        button(c, { w: hw, h: bh, text: '意见反馈', style: 'sky', icon: gm.textures.icon('heart', P.ink), onClick: () => this.sm.go('feedback') }, hw / 2 + 8, y - bh / 2);
        y -= bh + 16;
        if (best) label(c, `每日挑战最佳：${best}`, Theme.font.tiny, { color: Theme.textMuted, width: W }).node.setPosition(0, y - 10);
        this.list.setContentHeight(-y + 50);
        this.list.scrollToTop();
    }

    private bestDaily(): string | null {
        const d = this.gm.save.data.daily;
        let best = 0;
        for (const k of Object.keys(d)) if (d[k].completed && (best === 0 || d[k].bestTimeMs < best)) best = d[k].bestTimeMs;
        return best > 0 ? formatDuration(best) : null;
    }

    private shareProfile(): void {
        const gm = this.gm;
        const info = gm.progress.level();
        const ov = gm.collection.overall();
        const ach = gm.progress.achievementsView();
        const art = gm.collection.latestUnlocked();
        gm.share.shareCardOf('profile', {
            artId: art ? art.id : 'cat_orange', title: `Lv.${info.level} ${gm.progress.title()}`, subtitle: '像素搭子名片', stars: 0,
            lines: [`收藏 ${ov.collected}/${ov.total}`, `成就 ${ach.filter((a) => a.unlocked).length}/${ach.length}`], footer: '一起来拼像素画！',
            text: `我是《像素搭子》Lv.${info.level}「${gm.progress.title()}」，收藏了 ${ov.collected}/${ov.total} 件作品`,
        }).then((r) => this.sm.toast(r.message));
    }
}
