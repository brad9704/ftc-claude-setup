#!/usr/bin/env node
// 상태줄이 백그라운드로 부르는 업데이트 확인. 설정 저장소의 최신 커밋을 받아 ~/.claude/ftc/update-check.json에 적는다.
// 상태줄은 이 파일만 읽으므로 네트워크가 느려도 상태줄이 멈추지 않는다.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

const FTC_DIR = process.env.FTC_DIR || path.join(os.homedir(), ".claude", "ftc");
const OUT = path.join(FTC_DIR, "update-check.json");
let ver = {};
try { ver = JSON.parse(fs.readFileSync(path.join(FTC_DIR, "version.json"), "utf8")); } catch (e) { process.exit(0); }
if (!ver.remote) process.exit(0);

execFile("git", ["ls-remote", ver.remote, "HEAD"], { timeout: 15000, env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: "0" }) }, (err, stdout) => {
  const rec = { checked_at: Date.now(), remote: null, ok: false };
  if (!err) {
    const m = String(stdout).match(/^([0-9a-f]{40})\s+HEAD/m);
    if (m) { rec.remote = m[1]; rec.ok = true; }
  }
  try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 무시 */ }
});
