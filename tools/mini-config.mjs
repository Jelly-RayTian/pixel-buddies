#!/usr/bin/env node
// 用法：node tools/mini-config.mjs <platform> <输出配置路径> [--strict]
// 读取 build-configs/<platform>.release.json + 环境变量（tools/release.env），写出实际构建配置并检查。
// --strict（RELEASE=1 时）：有错误就退出码 1，阻止构建提审包。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkMiniRelease, effectiveMiniConfig } from './release-lib.mjs';

const [platform, out, flag] = process.argv.slice(2);
if (!platform || !out) {
    console.error('用法：node tools/mini-config.mjs <wechatgame|bytedance-mini-game> <输出路径> [--strict]');
    process.exit(2);
}
const here = dirname(fileURLToPath(import.meta.url));
const base = JSON.parse(readFileSync(join(here, 'build-configs', `${platform}.release.json`), 'utf8'));
const cfg = effectiveMiniConfig(platform, base, process.env);
writeFileSync(out, JSON.stringify(cfg, null, 2));
// 只有存在远程分包（assets/*.meta 里 bundleConfigID 为 pb_music_remote_cfg）时才需要远程资源域名
const assetsDir = join(here, '..', 'assets');
const hasRemote = readdirSync(assetsDir).some((f) => f.endsWith('.meta') && readFileSync(join(assetsDir, f), 'utf8').includes('pb_music_remote_cfg'));
const { errors, warnings } = checkMiniRelease(platform, cfg, { hasRemote });
for (const w of warnings) console.log(`  · ${w}`);
for (const e of errors) console.error(`  ✖ ${e}`);
if (errors.length && flag === '--strict') {
    console.error(`${platform}：发布检查未通过（以上 ${errors.length} 项）。仅本地/体验版测试可去掉 RELEASE=1。`);
    process.exit(1);
}
if (errors.length) console.error(`  ⚠ 以上问题不影响本地/体验版测试，但提审前必须解决（RELEASE=1 时会阻止构建）`);
