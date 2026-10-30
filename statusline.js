#!/usr/bin/env node
// 상태줄: 현재 모델 라벨, 이번 주 남은 예산, 이번 턴 탄소, 누적 탄소.
// 이번 턴 금액과 토큰 수, 누적 금액을 표시한다(2026-10-28 결정: 학생에게 토큰 수와 금액 공개).
// 값은 로컬 대화 기록(~/.claude/projects/**/*.jsonl)으로 계산한 추정치이며,
// 실제 차감액의 기준은 BizRouter 사용량 기록이다.

const fs = require("fs");
const path = require("path");
const os = require("os");

const HOME = os.homedir();
const FTC_DIR = process.env.FTC_DIR || path.join(HOME, ".claude", "ftc");
const PROJECTS_DIR = process.env.FTC_PROJECTS_DIR || path.join(HOME, ".claude", "projects");
const CACHE_FILE = path.join(FTC_DIR, "ledger-cache.json");

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    return fallback;
  }
}

const config = readJson(path.join(FTC_DIR, "config.json"), null);

function findModel(modelId) {
  if (!config || !modelId) return null;
  const id = String(modelId).toLowerCase();
  for (const m of config.models) {
    if (id === m.id.toLowerCase() || id === String(m.behavesAs || "").toLowerCase()) return m;
  }
  for (const m of config.models) {
    if ((m.match || []).some((s) => id.includes(s.toLowerCase()))) return m;
  }
  return null;
}

function usageParts(u) {
  const input = u.input_tokens || 0;
  const output = u.output_tokens || 0;
  const read = u.cache_read_input_tokens || 0;
  let w5 = 0;
  let w1h = 0;
  if (u.cache_creation && typeof u.cache_creation === "object") {
    w5 = u.cache_creation.ephemeral_5m_input_tokens || 0;
    w1h = u.cache_creation.ephemeral_1h_input_tokens || 0;
  }
  const wTotal = u.cache_creation_input_tokens || 0;
  if (w5 + w1h === 0) w5 = wTotal;
  // BizRouter가 응답 usage에 넣어 주는 청구 요금. 대화 기록에 남아 있으면 단가 계산 대신 이 값을 쓴다.
  const billed = typeof u.cost_krw === "number" ? u.cost_krw : null;
  return { input, output, read, w5, w1h, billed };
}

// 프롬프트 토큰 수(입력+캐시 읽기+캐시 쓰기)로 가격 구간을 고른다.
function tierFor(m, promptTokens) {
  for (const t of m.tiers) {
    if (t.max_prompt_tokens == null || promptTokens <= t.max_prompt_tokens) return t;
  }
  return m.tiers[m.tiers.length - 1];
}

function costKrw(m, p) {
  if (p.billed != null) return p.billed;
  const t = tierFor(m, p.input + p.read + p.w5 + p.w1h);
  return (
    (p.input * t.input + p.read * t.cache_read + p.w5 * t.cache_write_5m + p.w1h * t.cache_write_1h + p.output * t.output) / 1e6
  );
}

// 100만 토큰당 탄소(g). energy 모드: kWh/Mtok × 서버 오버헤드 × PUE × 전력망 계수(g/kWh).
// per_token 모드: carbon_g_per_mtok를 그대로 씀. 값이 하나라도 비면 null(상태줄에 "탄소 계수 미설정")
function gPerMtok(m) {
  if (config.carbon_mode === "energy") {
    const e = m.kwh_per_mtok || {};
    const k = config.server_overhead, pue = config.pue, grid = config.grid_g_per_kwh;
    if (e.input == null || e.output == null || k == null || pue == null || grid == null) return null;
    const f = k * pue * grid;
    return { input: e.input * f, output: e.output * f };
  }
  const c = m.carbon_g_per_mtok || {};
  if (c.input == null || c.output == null) return null;
  return { input: c.input, output: c.output };
}

function carbonG(m, p) {
  if (config.carbon_mode === "price_proportional") {
    return config.g_per_krw == null ? null : costKrw(m, p) * config.g_per_krw;
  }
  const gm = gPerMtok(m);
  if (!gm) return null;
  const cin = gm.input;
  const cout = gm.output;
  const f = config.carbon_cache_read_factor;
  return ((p.input + p.w5 + p.w1h + p.read * f) * cin + p.output * cout) / 1e6;
}

function listJsonl(dir) {
  const out = [];
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listJsonl(p));
    else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

// 한 파일에서 API 응답 단위 기록을 뽑는다. 같은 응답이 여러 줄로 저장되므로 message.id로 중복 제거.
function parseFile(file) {
  const entries = [];
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    return entries;
  }
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch (e) {
      continue;
    }
    if (o.type !== "assistant" || !o.message || !o.message.usage) continue;
    const model = o.message.model;
    if (!model || model === "<synthetic>") continue;
    const m = findModel(model);
    if (!m) continue;
    // 원시 토큰만 캐시에 두고 금액과 탄소는 읽을 때 계산한다(config를 바꾸면 바로 반영되도록).
    entries.push({
      id: (o.message.id || "") + "|" + (o.requestId || ""),
      ts: Date.parse(o.timestamp || "") || 0,
      model: m.key,
      p: usageParts(o.message.usage),
    });
  }
  return entries;
}

function loadLedger() {
  const CACHE_V = 2;
  let cache = readJson(CACHE_FILE, null);
  if (!cache || cache.v !== CACHE_V) cache = { v: CACHE_V, files: {} };
  const next = { v: CACHE_V, files: {} };
  for (const f of listJsonl(PROJECTS_DIR)) {
    let st;
    try {
      st = fs.statSync(f);
    } catch (e) {
      continue;
    }
    const c = cache.files[f];
    if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) next.files[f] = c;
    else next.files[f] = { mtimeMs: st.mtimeMs, size: st.size, entries: parseFile(f) };
  }
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(next));
  } catch (e) {
    /* 캐시 실패는 표시에 영향 없음 */
  }
  // 같은 응답이 여러 줄로 저장되므로 마지막 줄의 usage를 쓴다
  const seen = new Map();
  for (const f of Object.keys(next.files)) {
    for (const e of next.files[f].entries) {
      const m = config.models.find((x) => x.key === e.model);
      if (!m) continue;
      seen.set(e.id, { ts: e.ts, cost: costKrw(m, e.p), carbon: carbonG(m, e.p) });
    }
  }
  return [...seen.values()];
}

// 현재 대화에서 마지막 사용자 입력 이후의 응답만 모아 이번 턴의 금액, 토큰, 탄소를 계산한다.
// 같은 응답이 여러 줄로 저장되므로 message.id로 묶고 마지막 줄의 usage를 쓴다.
// 마지막 응답 시각도 함께 돌려준다(캐시가 아직 살아 있는지 판단용).
function readTurn(transcriptPath) {
  const empty = { carbon: null, cost: 0, n: 0, lastTs: 0 };
  let text;
  try {
    text = fs.readFileSync(transcriptPath, "utf8");
  } catch (e) {
    return empty;
  }
  let turn = new Map();
  let lastTs = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch (e) {
      continue;
    }
    if (o.type === "user" && !o.isMeta && o.message) {
      const c = o.message.content;
      const isToolResult = Array.isArray(c) && c.length > 0 && c.every((b) => b && b.type === "tool_result");
      if (!isToolResult) turn = new Map();
      continue;
    }
    if (o.type !== "assistant" || !o.message || !o.message.usage) continue;
    const m = findModel(o.message.model);
    if (!m) continue;
    const ts = Date.parse(o.timestamp || "") || 0;
    if (ts > lastTs) lastTs = ts;
    turn.set((o.message.id || "") + "|" + (o.requestId || ""), { m, p: usageParts(o.message.usage) });
  }
  const r = { carbon: 0, cost: 0, n: turn.size, lastTs, tok: { input: 0, read: 0, write: 0, output: 0 }, won: { input: 0, read: 0, write: 0, output: 0 } };
  for (const { m, p } of turn.values()) {
    r.cost += costKrw(m, p);
    // 항목별 금액은 단가표로 계산한 값(합계는 BizRouter 청구액이 있으면 그것을 씀)
    const t = tierFor(m, p.input + p.read + p.w5 + p.w1h);
    r.tok.input += p.input;
    r.tok.read += p.read;
    r.tok.write += p.w5 + p.w1h;
    r.tok.output += p.output;
    r.won.input += (p.input * t.input) / 1e6;
    r.won.read += (p.read * t.cache_read) / 1e6;
    r.won.write += (p.w5 * t.cache_write_5m + p.w1h * t.cache_write_1h) / 1e6;
    r.won.output += (p.output * t.output) / 1e6;
    const g = carbonG(m, p);
    if (g == null || r.carbon == null) r.carbon = null;
    else r.carbon += g;
  }
  return r;
}

// 캐시가 살아 있을 때만, 다른 모델로 바꾸면 대화 전체를 새 모델 캐시에 다시 써야 하는 비용을 보여 준다.
// 캐시가 이미 식었으면 남아 있어도 다시 써야 하므로 전환에 따른 추가 비용이 없다.
function switchHint(input, current, lastTs) {
  if (!config.show_switch_cost || !current) return null;
  const ttl = (config.cache_ttl_minutes || 5) * 60 * 1000;
  if (!lastTs || Date.now() - lastTs >= ttl) return null;
  const cw = input.context_window || {};
  let ctx = cw.total_input_tokens;
  if (ctx == null && cw.current_usage) {
    const u = cw.current_usage;
    ctx = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  }
  if (!ctx) return null;
  const other = config.models.find((m) => m.key !== current.key);
  if (!other) return null;
  const t = tierFor(other, ctx);
  const wp = (config.cache_ttl_minutes || 5) >= 60 ? t.cache_write_1h : t.cache_write_5m;
  const won = (ctx * wp) / 1e6;
  let g;
  if (config.carbon_mode === "price_proportional") {
    g = config.g_per_krw == null ? null : won * config.g_per_krw;
  } else {
    const gm = gPerMtok(other);
    g = gm ? (ctx * gm.input) / 1e6 : null;
  }
  const name = other.label.replace(/\s*\(.*\)\s*$/, "");
  const leftMin = Math.max(1, Math.ceil((ttl - (Date.now() - lastTs)) / 60000));
  const carbonPart = g == null ? "탄소 미설정" : "+" + fmtG(g);
  return name + "로 바꾸면 캐시 재작성 +" + fmtWon(won) + ", " + carbonPart + " (" + leftMin + "분 안)";
}

function fmtWon(x) {
  if (x > 0 && x < 0.1) return "0.1원 미만";
  if (x > 0 && x < 10) return x.toFixed(1) + "원";
  return Math.round(x).toLocaleString("ko-KR") + "원";
}

// 토큰 수를 만, 천 단위로 짧게
function fmtTok(n) {
  if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1) + "만";
  if (n >= 1000) return (n / 1000).toFixed(1) + "천";
  return String(n);
}

function fmtG(x) {
  return x < 10 ? x.toFixed(2) + "g" : x.toFixed(1) + "g";
}

function main(input) {
  if (!config) {
    process.stdout.write("설정 파일(~/.claude/ftc/config.json)이 없음");
    return;
  }
  const m = findModel(input.model && input.model.id);
  const label = m ? m.label : (input.model && input.model.display_name) || "모델 확인 불가";
  const mode = readJson(path.join(FTC_DIR, "mode.json"), {}).mode;
  const now = Date.now();
  const ledger = loadLedger();
  const turn = input.transcript_path ? readTurn(input.transcript_path) : { carbon: null, cost: 0, n: 0, lastTs: 0 };

  // 첫째 줄: 모델, 이번 턴 금액, 누적 금액
  const line1 = [mode === "anthropic" ? "[시험: Anthropic 직접] " + label : label];
  line1.push("이번 턴 " + fmtWon(turn.n > 0 ? turn.cost : 0));
  line1.push("누적 " + fmtWon(ledger.reduce((a, e) => a + e.cost, 0)));

  // 둘째 줄: 이번 턴 토큰을 항목별로(토큰 수와 금액)
  let lineTok = "이번 턴 토큰: 아직 없음";
  if (turn.n > 0) {
    const part = (name, k) => name + " " + fmtTok(turn.tok[k]) + "(" + fmtWon(turn.won[k]) + ")";
    lineTok =
      "이번 턴 토큰: " +
      [part("입력", "input"), part("캐시 읽기", "read"), part("캐시 쓰기", "write"), part("출력", "output")].join(", ");
  }

  // 셋째 줄: 이번 주 예산, 탄소
  const line2 = [];
  const week = config.weeks.find((w) => now >= Date.parse(w.start) && now < Date.parse(w.end));
  if (week && week.budget_krw != null) {
    const ws = Date.parse(week.start);
    const we = Date.parse(week.end);
    const spent = ledger.filter((e) => e.ts >= ws && e.ts < we).reduce((a, e) => a + e.cost, 0);
    const left = Math.max(0, week.budget_krw - spent);
    const pct = Math.round((left / week.budget_krw) * 100);
    line2.push("이번 주 남은 예산 " + fmtWon(left) + " / " + fmtWon(week.budget_krw) + " (" + pct + "%)");
  } else if (week) {
    line2.push(week.name + " 예산 미설정");
  } else {
    line2.push("예산 기간 아님");
  }
  const ss = Date.parse(config.study_start);
  const cum = ledger.filter((e) => e.ts >= ss);
  if (turn.carbon == null || cum.some((e) => e.carbon == null)) {
    line2.push("탄소 계수 미설정");
  } else {
    line2.push("이번 턴 탄소 " + fmtG(turn.carbon));
    line2.push("누적 탄소 " + fmtG(cum.reduce((a, e) => a + e.carbon, 0)));
  }

  let out = line1.join(" | ") + "\n" + lineTok + "\n" + line2.join(" | ");
  const hint = switchHint(input, m, turn.lastTs);
  if (hint) out += "\n" + hint;
  process.stdout.write(out);
}

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let input = {};
  try {
    input = JSON.parse(raw || "{}");
  } catch (e) {
    /* 빈 입력 */
  }
  try {
    main(input);
  } catch (e) {
    process.stdout.write("상태줄 오류: " + e.message);
  }
});
