#!/usr/bin/env node
// 학생 작업 공간 설정. 보통은 init.sh가 부른다.
//   node setup.js --key sk-br-v1-...      (또는 환경 변수 FTC_KEY)
// 키를 주지 않으면 settings.json에 이미 있는 키를 그대로 쓴다(재실행용).
// ~/.claude/ftc/ 에 스크립트와 config를 복사하고 ~/.claude/settings.json 에 필요한 키를 병합한다.
// 이미 있는 다른 설정은 건드리지 않는다. model은 비어 있을 때만 모델 A로 넣는다
// (이후에는 학생이 /model로 고른 값이 그대로 유지됨).

const fs = require("fs");
const path = require("path");
const os = require("os");

const args = process.argv.slice(2);
const keyIdx = args.indexOf("--key");
let KEY = (keyIdx >= 0 ? args[keyIdx + 1] : process.env.FTC_KEY) || "";
KEY = KEY.trim();

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, ".claude");
const FTC_DIR = path.join(CLAUDE_DIR, "ftc");
const SRC = __dirname;

fs.mkdirSync(FTC_DIR, { recursive: true });
for (const f of ["config.json", "statusline.js", "switch-log.js", "snapshot.js", "serve.js", "update-check.js", "topup.js"]) {
  fs.copyFileSync(path.join(SRC, f), path.join(FTC_DIR, f));
}

// 설치한 설정의 버전(저장소 커밋). 상태줄이 GitHub의 최신 커밋과 비교해 업데이트 안내를 띄운다.
{
  const { execFileSync } = require("child_process");
  const git = (...a) => { try { return execFileSync("git", ["-C", SRC, ...a], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch (e) { return null; } };
  const ver = { commit: git("rev-parse", "HEAD"), remote: git("remote", "get-url", "origin"), installed_at: new Date().toISOString() };
  fs.writeFileSync(path.join(FTC_DIR, "version.json"), JSON.stringify(ver) + "\n");
  try { fs.unlinkSync(path.join(FTC_DIR, "update-check.json")); } catch (e) { /* 없음 */ }
}

// 작업 폴더와 CLAUDE.md(스택 지정만). 학생이 이미 고쳤을 수 있으므로 없을 때만 만든다.
const WORK_DIR = path.join(HOME, "ftc");
fs.mkdirSync(WORK_DIR, { recursive: true });
const claudeMd = path.join(WORK_DIR, "CLAUDE.md");
if (!fs.existsSync(claudeMd)) fs.copyFileSync(path.join(SRC, "CLAUDE.md"), claudeMd);

const config = JSON.parse(fs.readFileSync(path.join(FTC_DIR, "config.json"), "utf8"));
const [A, B] = config.models;

const settingsPath = path.join(CLAUDE_DIR, "settings.json");
let s = {};
if (fs.existsSync(settingsPath)) {
  s = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  fs.copyFileSync(settingsPath, settingsPath + ".bak-" + Date.now());
}
// 키 종류로 연결 방식을 정한다.
//   sk-br-v1-  : 학생용. BizRouter를 거침(본 실험)
//   sk-ant-    : 연구진 시험용. Anthropic API에 직접 연결. 가격, 사용량 기록, 키 허용 모델 제한은 BizRouter와 다름
const ANT_KEY_FILE = path.join(FTC_DIR, "anthropic-key");
s.env = Object.assign({}, s.env);
if (!KEY) {
  if (s.env.ANTHROPIC_AUTH_TOKEN && s.env.ANTHROPIC_AUTH_TOKEN.startsWith("sk-br-v1-")) KEY = s.env.ANTHROPIC_AUTH_TOKEN;
  else if (s.apiKeyHelper && fs.existsSync(ANT_KEY_FILE)) KEY = fs.readFileSync(ANT_KEY_FILE, "utf8").trim();
}
let MODE;
if (KEY.startsWith("sk-br-v1-")) MODE = "bizrouter";
else if (KEY.startsWith("sk-ant-")) MODE = "anthropic";
else {
  console.error("키가 없거나 형식이 다름. sk-br-v1- (BizRouter) 또는 sk-ant- (Anthropic, 시험용)로 시작해야 함");
  process.exit(1);
}
// BizRouter는 카탈로그 코드(anthropic/claude-sonnet-5.5), Anthropic API는 원래 모델 ID(claude-sonnet-5-5)를 받는다
const idOf = (m) => (MODE === "anthropic" ? m.behavesAs : m.id);

if (MODE === "bizrouter") {
  Object.assign(s.env, {
    ANTHROPIC_BASE_URL: "https://api.bizrouter.ai/claude",
    // BizRouter 문서의 Claude Code 연동 방식(Bearer). ANTHROPIC_API_KEY를 비워 첫 실행 승인 창을 피함
    ANTHROPIC_AUTH_TOKEN: KEY,
    ANTHROPIC_API_KEY: "",
  });
  delete s.apiKeyHelper;
  try { fs.unlinkSync(ANT_KEY_FILE); } catch (e) { /* 없음 */ }
} else {
  // Anthropic 직접 연결. 키는 권한 600 파일에 두고 apiKeyHelper로 넘긴다(환경 변수로 주면 첫 실행 때 사용 승인 창이 뜸)
  delete s.env.ANTHROPIC_BASE_URL;
  delete s.env.ANTHROPIC_AUTH_TOKEN;
  delete s.env.ANTHROPIC_API_KEY;
  fs.writeFileSync(ANT_KEY_FILE, KEY + "\n", { mode: 0o600 });
  fs.chmodSync(ANT_KEY_FILE, 0o600);
  s.apiKeyHelper = `cat "${ANT_KEY_FILE}"`;
}
fs.writeFileSync(path.join(FTC_DIR, "mode.json"), JSON.stringify({ mode: MODE }) + "\n");

// 캐시 수명: config.json의 cache_ttl_minutes가 60 이상이면 1시간, 아니면 5분
const TTL = (config.cache_ttl_minutes || 5) >= 60 ? "1h" : "5m";
// 사고 강도: config.json의 effort_level (기본 medium)
const EFFORT = config.effort_level || "medium";

Object.assign(s.env, {
  // 별칭과 백그라운드 작업이 허용 목록 밖의 모델을 부르지 않도록 고정
  ANTHROPIC_DEFAULT_OPUS_MODEL: idOf(A),
  ANTHROPIC_DEFAULT_SONNET_MODEL: idOf(A),
  ANTHROPIC_DEFAULT_HAIKU_MODEL: idOf(B),
  // 학생이 고르지 않은 모델 호출을 줄임: 세션 제목 생성 끄기, 경량 모델로 도는 내장 탐색/계획 하위 에이전트 끄기.
  // 남는 하위 에이전트는 본 대화 모델을 따른다.
  CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "1",
  CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS: "1",
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  // 실험 기간 동안 모든 학생이 init.sh가 설치한 같은 버전을 쓰도록 자동 업데이트와 수동 업데이트를 모두 막음
  DISABLE_UPDATES: "1",
  // 응답 뒤에 다음 프롬프트를 회색으로 제안하는 기능 끄기. 제안 생성 요청이 매 턴 따로 과금된다
  CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: "false",
  // 캐시 수명을 config의 cache_ttl_minutes(5 또는 60)에 맞춰 고정. 상태줄의 전환 비용 계산도 같은 값을 씀
  CLAUDE_CODE_PROMPT_CACHE_TTL: TTL,
  CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL: TTL,
  // 사고 강도(effort)를 모든 학생에게 같게 고정. 환경 변수가 /effort, --effort, settings보다 우선하므로
  // 학생이 바꿔도 적용되지 않음. 모델 선택과 effort가 섞여 비용과 탄소 차이를 해석할 수 없게 되는 것을 막음
  CLAUDE_CODE_EFFORT_LEVEL: EFFORT,
  // 하위 에이전트도 같은 강도로 (2.1.316부터 하위 에이전트는 세션 강도를 물려받지 않을 수 있음)
  CLAUDE_CODE_SUBAGENT_EFFORT: EFFORT,
  // auto mode의 안전 검사(classifier) 모델을 모델 B(경량)로 고정. 지정하지 않으면 'sonnet' 별칭(= 모델 A)을 먼저 시도해
  // 학생이 고른 모델과 무관하게 모델 A 요청이 생기고, 검사 비용이 학생의 모델 선택에 따라 달라짐
  CLAUDE_CODE_AUTO_MODE_MODEL: idOf(B),
  // BizRouter는 서버 측 무료 검사(safeguards)를 전달하지 않으므로 요청하지 않음. 켜 두면 첫 검사 때
  // "this session isn't eligible" 안내가 떠서 학생이 Enter를 눌러야 함. BizRouter가 지원하면 이 줄을 지움
  CLAUDE_CODE_AUTO_MODE_SERVER: "0",
});
// 5분이면 최우선 순위 변수로 한 번 더 고정(다른 설정이나 ENABLE_PROMPT_CACHING_1H가 있어도 5분)
if (TTL === "5m") s.env.FORCE_PROMPT_CACHING_5M = "1";
else delete s.env.FORCE_PROMPT_CACHING_5M;
s.promptCacheTtl = TTL;
s.subagentPromptCacheTtl = TTL;
// 1시간 캐시에서는 방치된 대화를 캐시 만료 직전에 자동 압축할 수 있음. 학생 모르게 비용이 나가므로 끔
if (TTL === "1h") s.idleCompaction = false;

s.effortLevel = EFFORT;
// 모델별 effort 덮어쓰기가 남아 있으면 지움 (최상위 effortLevel보다 우선하기 때문)
if (s.modelSettings) for (const k of Object.keys(s.modelSettings)) {
  if (s.modelSettings[k] && "effortLevel" in s.modelSettings[k]) delete s.modelSettings[k].effortLevel;
}
s.promptSuggestionEnabled = false;
s.availableModels = [idOf(A), idOf(B)];
s.enforceAvailableModels = true;
s.modelPicker = {
  replaceBuiltInOptions: true,
  options: [
    { model: idOf(A), label: A.label, description: "고성능 모델", behavesAs: A.behavesAs },
    { model: idOf(B), label: B.label, description: "경량 모델", behavesAs: B.behavesAs },
  ],
};
// 비어 있거나 다른 연결 방식의 모델 ID가 남아 있으면 모델 A로. 학생이 /model로 고른 값은 유지
if (!s.availableModels.includes(s.model)) s.model = idOf(A);

const cmd = (name, arg) => `node "${path.join(FTC_DIR, name)}"${arg ? " " + arg : ""}`;
s.hooks = Object.assign({}, s.hooks, {
  PreModelSwitch: [{ hooks: [{ type: "command", command: cmd("switch-log.js", "pre") }] }],
  PostModelSwitch: [{ hooks: [{ type: "command", command: cmd("switch-log.js", "post") }] }],
  UserPromptSubmit: [{ hooks: [{ type: "command", command: cmd("snapshot.js", "prompt") }] }],
  Stop: [{ hooks: [{ type: "command", command: cmd("snapshot.js", "stop") }] }],
});
// 30초마다 다시 그려 캐시가 식으면 전환 비용 안내가 사라지게 함
s.statusLine = { type: "command", command: cmd("statusline.js"), refreshInterval: 30 };

fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2));
console.log("설정 완료: " + settingsPath);
console.log("연결: " + (MODE === "bizrouter" ? "BizRouter" : "Anthropic API 직접 (시험용)"));
console.log("시작 모델: " + s.model);
console.log("작업 폴더: " + WORK_DIR);
console.log("다음 단계: cd ~/ftc && claude");
