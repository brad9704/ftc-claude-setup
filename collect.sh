#!/usr/bin/env bash
# 5주차 사후측정 직후 실행. 대화 기록, 모델 전환 기록, 코드 스냅샷을 학생 연구 코드 이름의 압축 파일로 묶는다.
#   bash collect.sh S01
# 만든 파일을 연구진이 정한 경로로 업로드한다. 키가 들어 있는 settings.json은 묶지 않는다.
set -euo pipefail
ID="${1:?학생 연구 코드를 인자로 주십시오 (예: S01)}"
OUT="$HOME/ftc-logs-$ID-$(date +%Y%m%d).tgz"
cd "$HOME/.claude"
ITEMS=(projects)
for p in ftc/switch-log.jsonl ftc/view-log.jsonl ftc/browser-errors.jsonl ftc/config.json ftc/snap; do
  [ -e "$p" ] && ITEMS+=("$p")
done
echo "묶는 중: ${ITEMS[*]}"
tar czf "$OUT" "${ITEMS[@]}" &
pid=$!; start=$SECONDS
while kill -0 "$pid" 2>/dev/null; do
  printf '\r묶는 중 (%d초)   ' $((SECONDS - start)); sleep 0.5
done
wait "$pid"
printf '\r완료 (%d초)          \n' $((SECONDS - start))
echo "만든 파일: $OUT ($(du -h "$OUT" | cut -f1))"
echo "더보기 메뉴(⋮)의 다운로드(Download)에서 위 경로를 넣어 내려받으세요"
