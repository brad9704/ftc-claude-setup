#!/usr/bin/env node
// 연구진이 BizRouter에서 이 학생의 키 한도를 올린 뒤, 학생이 실행해 상태줄 예산에 추가 금액을 반영한다.
//   node ~/.claude/ftc/topup.js 10000
// 실제 사용 한도는 BizRouter 키 한도가 정한다. 이 명령은 상태줄 표시만 맞춘다.
// 기록은 ~/.claude/ftc/topup.jsonl 에 남고 5주차 자료 회수 때 함께 묶인다.
const fs = require("fs");
const path = require("path");
const os = require("os");

const FTC_DIR = process.env.FTC_DIR || path.join(os.homedir(), ".claude", "ftc");
const LOG = path.join(FTC_DIR, "topup.jsonl");
const fmt = (n) => Math.round(n).toLocaleString("ko-KR") + "원";

const arg = (process.argv[2] || "").replace(/[,원\s]/g, "");
const amount = Number(arg);
if (!Number.isInteger(amount) || amount <= 0 || amount > 200000) {
  console.error("사용법: node ~/.claude/ftc/topup.js <금액>   (예: node ~/.claude/ftc/topup.js 10000)");
  console.error("금액은 연구진이 알려 준 추가 지급액을 1~200,000 사이의 정수로 적습니다.");
  process.exit(1);
}
let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(FTC_DIR, "config.json"), "utf8"));
} catch (e) {
  console.error("설정 파일을 찾을 수 없습니다. 먼저 bash ~/ftc-claude-setup/init.sh 를 실행하십시오.");
  process.exit(1);
}
const now = Date.now();
const week = (config.weeks || []).find((w) => now >= Date.parse(w.start) && now < Date.parse(w.end));
if (!week) {
  console.error("지금은 예산 기간이 아니라 추가 금액을 반영할 주가 없습니다. 연구진에게 알려 주십시오.");
  process.exit(1);
}
fs.appendFileSync(LOG, JSON.stringify({ at: new Date(now).toISOString(), week: week.name, amount }) + "\n");
let total = 0;
for (const line of fs.readFileSync(LOG, "utf8").split("\n")) {
  try { const r = JSON.parse(line); if (r.week === week.name) total += r.amount; } catch (e) { /* 빈 줄 */ }
}
console.log(`${week.name} 예산에 ${fmt(amount)}을 더했습니다. 이번 주 추가 합계 ${fmt(total)}, 이번 주 예산 ${fmt((week.budget_krw || 0) + total)}.`);
console.log("상태줄은 다음 갱신 때 바뀝니다.");
