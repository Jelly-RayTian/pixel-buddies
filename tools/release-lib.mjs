// 小游戏发布配置（纯函数，供 mini-config.mjs 与测试使用）。
//
// 发布时需要的三个值都放在 tools/release.env（不进仓库，复制 release.env.example 填写）：
//   WX_APPID / TT_APPID   —— 微信 / 抖音 AppID
//   MINI_REMOTE_BASE      —— 仅当有远程分包（bundleConfigID 为 pb_music_remote_cfg）时需要：根地址必须是已 ICP 备案的 https 域名
//                            现在所有主题曲都是本地分包，不设也能提审
// 构建时把它们写进一份临时构建配置，不改动仓库里的 build-configs/*.release.json。

export const PLACEHOLDER_APPID = /YOUR_|^$/;

/** 不能 ICP 备案、因此不能加入微信/抖音合法域名的托管域名 */
export const UNFILED_HOST_SUFFIXES = ['.vercel.app', '.netlify.app', '.github.io', '.pages.dev', '.workers.dev', '.web.app', '.firebaseapp.com', '.onrender.com'];

const APPID_ENV = { wechatgame: 'WX_APPID', 'bytedance-mini-game': 'TT_APPID' };

/** 按环境变量生成实际使用的构建配置（不修改传入对象） */
export function effectiveMiniConfig(platform, base, env = {}) {
    const cfg = JSON.parse(JSON.stringify(base));
    const appid = env[APPID_ENV[platform]];
    if (appid) {
        cfg.packages = cfg.packages || {};
        cfg.packages[platform] = { ...(cfg.packages[platform] || {}), appid };
    }
    if (env.MINI_REMOTE_BASE) {
        cfg.server = `${env.MINI_REMOTE_BASE.replace(/\/+$/, '')}/mini/${platform}/`;
    }
    return cfg;
}

/** 检查一份小游戏构建配置能否提交审核。errors：上线后一定出问题；warnings：建议处理 */
export function checkMiniRelease(platform, cfg, opts = {}) {
    const hasRemote = !!opts.hasRemote;
    const errors = [];
    const warnings = [];
    const appid = cfg.packages?.[platform]?.appid || '';
    if (PLACEHOLDER_APPID.test(appid)) errors.push(`AppID 还是占位值（${appid || '空'}）：在 tools/release.env 里填 ${APPID_ENV[platform]}`);
    const server = cfg.server || '';
    if (!hasRemote) {
        // 没有远程分包：不需要远程资源域名，也不需要备案域名
    } else if (!server) {
        errors.push('没有设置远程资源地址：主题曲是远程分包，必须设置 MINI_REMOTE_BASE');
    } else {
        let host = '';
        try {
            const u = new URL(server);
            host = u.hostname.toLowerCase();
            if (u.protocol !== 'https:') errors.push(`远程资源地址必须是 https：${server}`);
        } catch {
            errors.push(`远程资源地址不是合法网址：${server}`);
        }
        const unfiled = !!host && UNFILED_HOST_SUFFIXES.some((s) => host.endsWith(s));
        if (unfiled) {
            errors.push(`远程资源域名 ${host} 无法 ICP 备案，不能加入 downloadFile 合法域名，正式版里主题曲会全部加载失败。换成已备案域名（如腾讯云 COS/CDN）后设置 MINI_REMOTE_BASE`);
        }
        if (host && !unfiled) warnings.push(`记得在${platform === 'wechatgame' ? '微信公众平台' : '抖音开放平台'}把 https://${host} 加入 downloadFile 合法域名`);
    }
    if (hasRemote && !cfg.md5Cache) warnings.push('建议打开 md5Cache，避免玩家拿到旧的远程资源');
    return { errors, warnings };
}
