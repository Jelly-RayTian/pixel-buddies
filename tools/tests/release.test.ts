import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-ignore 纯 JS 模块
import { checkMiniRelease, effectiveMiniConfig } from '../release-lib.mjs';

const base = (p: string) => JSON.parse(readFileSync(join(__dirname, '..', 'build-configs', `${p}.release.json`), 'utf8'));

for (const p of ['wechatgame', 'bytedance-mini-game']) {
    test(`${p}：仓库里的发布配置会被发布检查拦下（占位 AppID）；没有远程分包时不再要求备案域名`, () => {
        const r = checkMiniRelease(p, effectiveMiniConfig(p, base(p), {}));
        assert.ok(r.errors.some((e: string) => e.includes('AppID')));
        assert.ok(!r.errors.some((e: string) => e.includes('ICP')), '本地分包不需要远程域名');
        const withRemote = checkMiniRelease(p, effectiveMiniConfig(p, base(p), {}), { hasRemote: true });
        assert.ok(withRemote.errors.some((e: string) => e.includes('无法 ICP 备案')), '有远程分包时 vercel.app 仍会被拦下');
    });

    test(`${p}：只填 AppID、不设远程域名，也能通过检查（主题曲都在包里）`, () => {
        const cfg = effectiveMiniConfig(p, base(p), { WX_APPID: 'wx1234567890abcdef', TT_APPID: 'tt1234567890abcdef' });
        assert.deepEqual(checkMiniRelease(p, cfg).errors, []);
    });

    test(`${p}：填好 release.env 后通过检查，且不修改原配置`, () => {
        const b = base(p);
        const env = { WX_APPID: 'wx1234567890abcdef', TT_APPID: 'tt1234567890abcdef', MINI_REMOTE_BASE: 'https://cdn.example.cn/pb/' };
        const cfg = effectiveMiniConfig(p, b, env);
        assert.equal(cfg.server, `https://cdn.example.cn/pb/mini/${p}/`);
        assert.match(cfg.packages[p].appid, /^(wx|tt)1234567890abcdef$/);
        const r = checkMiniRelease(p, cfg, { hasRemote: true });
        assert.deepEqual(r.errors, []);
        assert.ok(r.warnings.some((w: string) => w.includes('cdn.example.cn')));
        assert.match(b.packages[p].appid, /YOUR_/);
    });
}

test('发布检查：有远程分包时，http、非法网址、缺地址都会报错', () => {
    const R = { hasRemote: true };
    const cfg = (server: string) => ({ md5Cache: true, server, packages: { wechatgame: { appid: 'wx1' } } });
    assert.ok(checkMiniRelease('wechatgame', cfg('http://cdn.example.cn/'), R).errors.length > 0);
    assert.ok(checkMiniRelease('wechatgame', cfg('not a url'), R).errors.length > 0);
    assert.ok(checkMiniRelease('wechatgame', cfg(''), R).errors.length > 0);
    assert.ok(checkMiniRelease('wechatgame', cfg('https://x.github.io/'), R).errors.length > 0);
});
