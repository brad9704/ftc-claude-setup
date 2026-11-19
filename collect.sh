#!/usr/bin/env bash
# 주차별 결과물 제출과 5주차 자료 회수에 쓴다. 작업 폴더(~/ftc)의 코드, 대화 기록, 모델 전환 기록,
# 코드 스냅샷을 학번 이름의 압축 파일 하나로 묶고 내려받기 창을 띄운다.
#   bash ~/ftc-claude-setup/collect.sh 20261234
# 키가 들어 있는 settings.json과 anthropic-key, 설치 폴더(node_modules, .venv)는 묶지 않는다.
set -euo pipefail
ID="${1:?학번을 인자로 주십시오 (예: bash collect.sh 20261234)}"
OUT="$HOME/ftc-$ID-$(date +%Y%m%d-%H%M).tgz"
cd "$HOME"
ITEMS=()
[ -d ftc ] && ITEMS+=(ftc)
for p in .claude/projects .claude/ftc/switch-log.jsonl .claude/ftc/view-log.jsonl .claude/ftc/browser-errors.jsonl \
         .claude/ftc/config.json .claude/ftc/version.json .claude/ftc/topup.jsonl .claude/ftc/ledger-cache.json .claude/ftc/snap; do
  [ -e "$p" ] && ITEMS+=("$p")
done
echo "묶는 중: ${ITEMS[*]}"
tar czf "$OUT" --exclude='ftc/node_modules' --exclude='ftc/.venv' --exclude='ftc/venv' --exclude='ftc/**/node_modules' \
    --exclude='ftc/.git' --exclude='__pycache__' "${ITEMS[@]}" &
pid=$!; start=$SECONDS
while kill -0 "$pid" 2>/dev/null; do
  printf '\r묶는 중 (%d초)   ' $((SECONDS - start)); sleep 0.5
done
wait "$pid"
printf '\r완료 (%d초)          \n' $((SECONDS - start))
echo "만든 파일: $OUT ($(du -h "$OUT" | cut -f1))"
if command -v cloudshell >/dev/null 2>&1; then
  echo "브라우저 내려받기 창을 엽니다. 받은 파일을 연구진이 안내한 곳에 올리세요"
  cloudshell download "$OUT" || echo "창이 안 뜨면 터미널 위 더보기 메뉴(⋮)의 다운로드(Download)에 위 경로를 넣으세요"
else
  echo "터미널 위 더보기 메뉴(⋮)의 다운로드(Download)에 위 경로를 넣어 내려받으세요"
fi
