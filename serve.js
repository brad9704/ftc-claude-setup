#!/usr/bin/env node
// 학생 작업 폴더(~/ftc)를 8080 포트로 보여 주는 정적 서버. 의존 패키지 없음.
//   node ~/.claude/ftc/serve.js
// Cloud Shell 상단의 웹 미리보기에서 8080 포트로 연다.
//
// 1. 열람 기록: 페이지를 열거나 새로 고칠 때마다 시각과 그 순간 코드 파일들의 해시를
//    ~/.claude/ftc/view-log.jsonl 에 남긴다(실행 횟수와 코드 버전 추적용).
// 2. 오류 전달: HTML을 내보낼 때 오류 수집 코드를 끼워 넣는다(학생 파일은 고치지 않음).
//    브라우저 오류, 처리되지 않은 Promise 오류, console.error, p5.js 친절한 오류 메시지를
//    ~/ftc/.logs/browser-errors.log 에 사람이 읽는 형태로 적는다. Claude Code는 브라우저를 볼 수 없으므로
//    이 파일이 화면 문제의 유일한 단서다. 원자료는 ~/.claude/ftc/browser-errors.jsonl 에도 남긴다.
// 3. 캐시를 끄므로 코드를 고친 뒤 새로 고치면 바로 반영된다.

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const HOME = os.homedir();
const ROOT = path.resolve(process.env.FTC_ROOT || path.join(HOME, "ftc"));
const PORT = Number(process.env.PORT || 8080);
const FTC_DIR = path.join(HOME, ".claude", "ftc");
const VIEW_LOG = path.join(FTC_DIR, "view-log.jsonl");
const ERR_JSONL = path.join(FTC_DIR, "browser-errors.jsonl");
const ERR_TEXT = path.join(ROOT, ".logs", "browser-errors.log");
const ERR_TEXT_MAX = 200 * 1024; // 넘으면 뒤쪽 절반만 남김
const SKIP = new Set([".git", ".logs", "node_modules", ".cache"]);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

// 브라우저에 끼워 넣는 코드. 학생 코드보다 먼저 실행되도록 <head> 바로 뒤에 넣는다.
// - 오류 수집: 같은 메시지는 한 번만 보내고(매 프레임 반복되는 오류 방지), 페이지당 최대 50건
// - 불러오는 중 표시: 페이지와 p5.js를 내려받는 동안 빈 화면 대신 경과 시간을 보여 주고, 다 불러오면 사라짐
// - 오류 표시: 오류가 기록되면 화면 오른쪽 아래에 건수만 작게 표시(클릭하면 닫힘). 고치는 방법은 안내하지 않음
const RELAY = `<script>/* ftc 오류 전달 (serve.js가 자동으로 넣음, 학생 파일에는 없음) */(function(){
var sent={},n=0;
var t0=Date.now(),ld=null,lt=null,bd=null,bn=0,closed=false;
function box(css,txt){var d=document.createElement('div');d.setAttribute('style','position:fixed;z-index:2147483647;font:13px/1.4 system-ui,sans-serif;padding:6px 10px;border-radius:6px;'+css);d.textContent=txt;(document.body||document.documentElement).appendChild(d);return d}
try{ld=box('left:10px;top:10px;background:#222;color:#fff;pointer-events:none','화면 불러오는 중 0초');
lt=setInterval(function(){if(ld)ld.textContent='화면 불러오는 중 '+Math.floor((Date.now()-t0)/1000)+'초'},500)}catch(_){}
function doneLoading(){clearInterval(lt);if(ld&&ld.parentNode)ld.parentNode.removeChild(ld);ld=null}
window.addEventListener('load',function(){requestAnimationFrame(function(){requestAnimationFrame(doneLoading)})});
function badge(){if(closed)return;bn++;try{if(!bd){bd=box('right:10px;bottom:10px;background:#ff0000;color:#fff;cursor:pointer','');bd.title='클릭하면 닫힘';bd.onclick=function(){closed=true;bd.parentNode.removeChild(bd)}}bd.textContent='브라우저 오류 '+bn+'건 기록됨'}catch(_){}}
function post(o){try{o.page=location.pathname;var k=o.type+'|'+o.message;if(sent[k]||n>=50)return;sent[k]=1;n++;if(o.type!=='console.error')badge();
var b=JSON.stringify(o);if(navigator.sendBeacon){navigator.sendBeacon('/__ftc/error',b)}else{fetch('/__ftc/error',{method:'POST',body:b,keepalive:true})}}catch(_){}}
function str(a){try{return typeof a==='string'?a:(a&&a.stack)?String(a.stack):JSON.stringify(a)}catch(_){return String(a)}}
function args(x){return Array.prototype.map.call(x,str).join(' ').slice(0,2000)}
window.addEventListener('error',function(e){
 if(e.target&&e.target!==window&&(e.target.src||e.target.href)){post({type:'불러오기 실패',message:String(e.target.src||e.target.href)});return}
 post({type:'오류',message:String(e.message),source:e.filename||null,line:e.lineno||null,col:e.colno||null,stack:e.error&&e.error.stack?String(e.error.stack).slice(0,2000):null});
},true);
window.addEventListener('unhandledrejection',function(e){var r=e.reason;post({type:'Promise 오류',message:String(r&&r.message||r),stack:r&&r.stack?String(r.stack).slice(0,2000):null})});
var ce=console.error;console.error=function(){post({type:'console.error',message:args(arguments)});return ce.apply(console,arguments)};
var cw=console.warn;console.warn=function(){var m=args(arguments);if(m.indexOf('p5.js says')>=0)post({type:'p5.js 안내',message:m});return cw.apply(console,arguments)};
var cl=console.log;console.log=function(){var m=args(arguments);if(m.indexOf('p5.js says')>=0)post({type:'p5.js 안내',message:m});return cl.apply(console,arguments)};
})();</script>`;

function codeHash() {
  const h = crypto.createHash("sha1");
  const walk = (dir) => {
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    } catch (e) {
      return;
    }
    for (const e of ents) {
      if (SKIP.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(html|css|m?js)$/i.test(e.name)) {
        try {
          h.update(path.relative(ROOT, p) + "\0");
          h.update(fs.readFileSync(p));
          h.update("\0");
        } catch (e2) {
          /* 읽기 실패는 건너뜀 */
        }
      }
    }
  };
  walk(ROOT);
  return h.digest("hex").slice(0, 12);
}

function append(file, text) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, text);
  } catch (e) {
    /* 기록 실패는 화면에 영향 없음 */
  }
}

function appendErrText(text) {
  append(ERR_TEXT, text);
  try {
    if (fs.statSync(ERR_TEXT).size > ERR_TEXT_MAX) {
      const s = fs.readFileSync(ERR_TEXT, "utf8");
      fs.writeFileSync(ERR_TEXT, "(앞부분 생략)\n" + s.slice(Math.floor(s.length / 2)));
    }
  } catch (e) {
    /* 무시 */
  }
}

function hhmmss(d) {
  return d.toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Seoul" });
}

function onPageView(urlPath) {
  const now = new Date();
  const code = codeHash();
  append(VIEW_LOG, JSON.stringify({ at: now.toISOString(), path: urlPath, code }) + "\n");
  appendErrText("\n---- 화면 열림 " + hhmmss(now) + " " + urlPath + " (코드 " + code + ")\n");
}

function onError(body) {
  let o;
  try {
    o = JSON.parse(body);
  } catch (e) {
    return;
  }
  const now = new Date();
  append(ERR_JSONL, JSON.stringify(Object.assign({ at: now.toISOString() }, o)) + "\n");
  let where = "";
  if (o.source) {
    let src = String(o.source);
    try {
      const u = new URL(src);
      src = u.host.includes("jsdelivr") ? u.pathname : u.pathname.replace(/^\//, "");
    } catch (e) {
      /* 그대로 */
    }
    where = " (" + src + (o.line ? ":" + o.line + (o.col ? ":" + o.col : "") : "") + ")";
  }
  let line = "[" + hhmmss(now) + "] " + (o.type || "오류") + ": " + String(o.message || "").trim() + where + "\n";
  if (o.stack && o.type !== "p5.js 안내") {
    line += String(o.stack)
      .split("\n")
      .slice(0, 6)
      .map((l) => "    " + l.trim())
      .join("\n") + "\n";
  }
  appendErrText(line);
}

function injectRelay(html) {
  const m = html.match(/<head[^>]*>/i);
  if (m) return html.slice(0, m.index + m[0].length) + RELAY + html.slice(m.index + m[0].length);
  const h = html.match(/<html[^>]*>/i);
  if (h) return html.slice(0, h.index + h[0].length) + RELAY + html.slice(h.index + h[0].length);
  return RELAY + html;
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch (e) {
    res.writeHead(400).end();
    return;
  }

  if (urlPath === "/__ftc/error" && req.method === "POST") {
    let body = "";
    req.on("data", (d) => {
      if (body.length < 20000) body += d;
    });
    req.on("end", () => {
      onError(body);
      res.writeHead(204).end();
    });
    return;
  }

  let file = path.join(ROOT, urlPath);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  } catch (e) {
    /* 아래에서 404 처리 */
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(urlPath.endsWith("/") ? "index.html 파일이 아직 없음" : "파일 없음: " + urlPath);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    if (ext === ".html") {
      onPageView(urlPath);
      data = Buffer.from(injectRelay(data.toString("utf8")), "utf8");
    }
    res.writeHead(200, {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.log(PORT + " 포트에서 이미 실행 중. 웹 미리보기에서 " + PORT + " 포트를 열면 됨");
    process.exit(0);
  }
  console.error(e.message);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(ROOT + " 를 " + PORT + " 포트로 보여 주는 중. Cloud Shell 웹 미리보기에서 " + PORT + " 포트를 열 것. 끄려면 Ctrl+C");
});
