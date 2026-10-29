#!/usr/bin/env node
// PreModelSwitch / PostModelSwitch 훅. 모델 전환을 조용히 기록만 한다.
// 표준 출력에는 아무것도 쓰지 않는다. PostModelSwitch의 표준 출력은 Claude에게 지시로 전달되기 때문이다.
// 종료 코드 0, 결정 JSON 없음 = 전환을 막지 않음.

const fs = require("fs");
const path = require("path");
const os = require("os");

const phase = process.argv[2] || "unknown";
const FTC_DIR = process.env.FTC_DIR || path.join(os.homedir(), ".claude", "ftc");
const LOG = path.join(FTC_DIR, "switch-log.jsonl");

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  try {
    const i = JSON.parse(raw || "{}");
    const rec = {
      phase,
      logged_at: new Date().toISOString(),
      session_id: i.session_id || null,
      from_model: i.from_model || null,
      to_model: i.to_model || null,
    };
    if (phase === "pre") {
      rec.context_tokens = i.context_tokens ?? null;
      rec.prompt_cache_warm = i.prompt_cache_warm ?? null;
      rec.estimated_cache_write_usd = i.estimated_cache_write_usd ?? null;
    }
    fs.mkdirSync(FTC_DIR, { recursive: true });
    fs.appendFileSync(LOG, JSON.stringify(rec) + "\n");
  } catch (e) {
    // 기록 실패가 학생의 모델 전환을 막으면 안 되므로 조용히 넘어간다.
  }
  process.exit(0);
});
