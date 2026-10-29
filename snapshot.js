#!/usr/bin/env node
// UserPromptSubmit / Stop 훅. 작업 폴더를 학생 몰래 쓰는 별도 git 저장소에 턴마다 커밋한다.
//   UserPromptSubmit 시점 커밋 = 직전 AI 응답 이후 학생이 직접 고친 내용
//   Stop 시점 커밋            = 이번 턴에 AI가 고친 내용
// 학생 자신의 .git은 건드리지 않는다. 표준 출력에는 아무것도 쓰지 않는다
// (UserPromptSubmit의 표준 출력은 Claude에게 전달되기 때문). git이 없거나 실패해도 조용히 넘어간다.

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const phase = process.argv[2] || "unknown";
const FTC_DIR = process.env.FTC_DIR || path.join(os.homedir(), ".claude", "ftc");

const EXCLUDE = [
  ".git/", "node_modules/", ".next/", "dist/", "build/", ".cache/",
  "__pycache__/", ".venv/", "venv/", "*.log", ".logs/", ".idx/", ".firebase/",
].join("\n") + "\n";

function git(gitDir, workTree, args) {
  return spawnSync(
    "git",
    ["--git-dir=" + gitDir, "--work-tree=" + workTree, "-c", "user.name=ftc", "-c", "user.email=ftc@local", ...args],
    { stdio: "ignore", timeout: 20000 }
  );
}

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  try {
    const i = JSON.parse(raw || "{}");
    const cwd = i.cwd || process.cwd();
    if (path.resolve(cwd) === path.resolve(os.homedir())) process.exit(0); // 홈 전체는 찍지 않음
    const hash = crypto.createHash("sha1").update(path.resolve(cwd)).digest("hex").slice(0, 12);
    const gitDir = path.join(FTC_DIR, "snap", hash + ".git");
    if (!fs.existsSync(gitDir)) {
      fs.mkdirSync(path.dirname(gitDir), { recursive: true });
      if (spawnSync("git", ["init", "--bare", "-q", gitDir], { stdio: "ignore" }).status !== 0) process.exit(0);
      fs.mkdirSync(path.join(gitDir, "info"), { recursive: true });
      fs.writeFileSync(path.join(gitDir, "info", "exclude"), EXCLUDE);
      fs.writeFileSync(path.join(gitDir, "ftc-worktree"), path.resolve(cwd) + "\n");
    }
    git(gitDir, cwd, ["add", "-A"]);
    const msg = JSON.stringify({ phase, session_id: i.session_id || null, at: new Date().toISOString() });
    git(gitDir, cwd, ["commit", "-q", "--allow-empty", "-m", msg]);
  } catch (e) {
    // 스냅샷 실패가 학생 작업을 막으면 안 됨
  }
  process.exit(0);
});
