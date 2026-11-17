#!/usr/bin/env node
// Cloud Shell 편집기에 Claude Code 확장을 설치하고, 로그인 화면이 뜨지 않게 설정한다. init.sh가 부른다.
// 편집기 터미널에도 확장 설치 명령(code)이 없어서 Open VSX에서 확장 파일을 받아 직접 풀고 목록(extensions.json)에 등록한다.
// 이미 설치돼 있으면 건너뛴다. 실패해도 init.sh는 계속 진행한다(편집기에서 직접 설치하면 됨).
//   node install-ext.js            설치돼 있으면 건너뜀
//   node install-ext.js --force    다시 받아 설치
const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");

const HOME = os.homedir();
const CODEOSS = path.join(HOME, ".codeoss");
const EXT_DIR = path.join(CODEOSS, "extensions");
const LIST = path.join(EXT_DIR, "extensions.json");
const MACHINE_SETTINGS = path.join(CODEOSS, "data", "Machine", "settings.json");
const ID = "anthropic.claude-code";
const PLATFORM = "linux-" + (process.arch === "arm64" ? "arm64" : "x64");
const FORCE = process.argv.includes("--force");

function get(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "ftc-setup" }, timeout: 60000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode + " " + url)); }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject).on("timeout", function () { this.destroy(new Error("시간 초과 " + url)); });
  });
}

function readList() {
  try { const a = JSON.parse(fs.readFileSync(LIST, "utf8")); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}

function installed() {
  return readList().some((e) => e.identifier && String(e.identifier.id).toLowerCase() === ID &&
    e.location && fs.existsSync(e.location.path || e.location.fsPath || ""));
}

// 로그인 화면 끄기. 웹 편집기의 사용자 설정은 브라우저에 저장되므로 서버 쪽 Machine 설정에 넣는다
function setMachineSetting() {
  let s = {};
  try {
    const raw = fs.readFileSync(MACHINE_SETTINGS, "utf8");
    if (raw.trim()) s = JSON.parse(raw);
  } catch (e) {
    if (e.code !== "ENOENT") { console.log("편집기 설정 파일을 읽지 못해 건너뜀(" + e.message + ")"); return; }
  }
  if (s["claudeCode.disableLoginPrompt"] === true) return;
  s["claudeCode.disableLoginPrompt"] = true;
  fs.mkdirSync(path.dirname(MACHINE_SETTINGS), { recursive: true });
  fs.writeFileSync(MACHINE_SETTINGS, JSON.stringify(s, null, 4) + "\n");
  console.log("편집기 설정: Claude Code 로그인 화면 끄기");
}

async function main() {
  setMachineSetting();
  if (!FORCE && installed()) { console.log("Claude Code 확장: 이미 설치됨"); return; }

  const meta = JSON.parse((await get(`https://open-vsx.org/api/anthropic/claude-code/${PLATFORM}/latest`)).toString("utf8"));
  const ver = meta.version;
  const url = meta.files && meta.files.download;
  if (!ver || !url) throw new Error("Open VSX 응답에 버전이나 다운로드 주소가 없음");
  console.log("Claude Code 확장 " + ver + " 받는 중");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ftc-ext-"));
  try {
    const vsix = path.join(tmp, "ext.vsix");
    fs.writeFileSync(vsix, await get(url));
    execFileSync("unzip", ["-q", vsix, "extension/*", "-d", tmp], { stdio: "ignore" });

    const rel = `${ID}-${ver}-${PLATFORM}`;
    const dest = path.join(EXT_DIR, rel);
    fs.mkdirSync(EXT_DIR, { recursive: true });
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(path.join(tmp, "extension"), dest);

    // 목록에서 이전 판을 빼고 새 판을 등록한다. 형식은 편집기가 직접 설치했을 때 남긴 항목과 같게 맞춤
    const list = readList().filter((e) => !(e.identifier && String(e.identifier.id).toLowerCase() === ID));
    list.push({
      identifier: { id: ID },
      version: ver,
      location: { $mid: 1, fsPath: dest, external: "file://" + dest, path: dest, scheme: "file" },
      relativeLocation: rel,
      metadata: { installedTimestamp: Date.now(), pinned: false, source: "vsix", targetPlatform: PLATFORM },
    });
    fs.writeFileSync(LIST, JSON.stringify(list));
    // 예전 판 폴더 정리
    for (const d of fs.readdirSync(EXT_DIR)) {
      if (d.startsWith(ID + "-") && d !== rel) fs.rmSync(path.join(EXT_DIR, d), { recursive: true, force: true });
    }
    console.log("Claude Code 확장 설치 완료. 편집기가 열려 있으면 새로고침(F5)");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.log("Claude Code 확장 자동 설치 실패: " + e.message);
  console.log("편집기 왼쪽 확장 아이콘에서 Claude Code(Anthropic)를 검색해 직접 설치하면 됨");
});
