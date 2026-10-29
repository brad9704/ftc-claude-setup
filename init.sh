#!/usr/bin/env bash
# 학생 작업 공간 한 번에 설정 (Google Cloud Shell)
#   bash ~/ftc-claude-setup/init.sh
# 1) Claude Code를 정해진 버전으로 설치  2) 개인 키 입력(화면에 안 보임)  3) 설정 적용  4) ~/ftc 에서 새 셸 열기
# 다시 실행해도 됨. 같은 버전이 이미 있으면 설치를 건너뛰고, 키 입력에서 Enter만 누르면 기존 키를 그대로 씀.
set -euo pipefail

CC_VERSION="2.1.308"   # 실험 기간 고정 버전. 2.1.251 이상이어야 모델 전환 훅이 동작함
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$HOME/.local/bin"
export PATH="$BIN:$PATH"

say() { printf '\n== %s\n' "$1"; }

# 오래 걸리는 명령을 돌리는 동안 같은 줄에 회전 표시와 경과 시간을 보여 줌. 명령 출력은 로그 파일로 보냄
run_with_progress() {
  local msg="$1" log="$2"; shift 2
  "$@" >"$log" 2>&1 &
  local pid=$! i=0 start=$SECONDS frames='|/-\'
  while kill -0 "$pid" 2>/dev/null; do
    printf '\r%s %s (%d초)   ' "${frames:i++%4:1}" "$msg" $((SECONDS - start))
    sleep 0.25
  done
  local rc=0
  wait "$pid" || rc=$?
  if [ "$rc" = 0 ]; then
    printf '\r완료: %s (%d초)          \n' "$msg" $((SECONDS - start))
  else
    printf '\r실패: %s                  \n' "$msg"
    echo "---- 마지막 출력 ----"; tail -n 15 "$log"
  fi
  return "$rc"
}

# 키 입력: 글자 대신 * 를 찍어 입력되고 있음을 보여 줌. 지우기(Backspace) 지원
read_masked() {
  local c out=""
  while IFS= read -rsn1 c; do
    if [ -z "$c" ]; then break; fi
    if [ "$c" = $'\x7f' ] || [ "$c" = $'\b' ]; then
      if [ -n "$out" ]; then out="${out%?}"; printf '\b \b' >&2; fi
      continue
    fi
    out+="$c"; printf '*' >&2
  done
  echo >&2
  # 붙여 넣기 때 섞일 수 있는 제어 문자와 공백 제거
  printf '%s' "$out" | sed 's/\x1b\[[0-9;]*~//g' | tr -d '[:space:][:cntrl:]'
}

say "1/3 Claude Code $CC_VERSION 설치"
current="$(claude --version 2>/dev/null | awk '{print $1}' || true)"
if [ "$current" = "$CC_VERSION" ]; then
  echo "이미 설치되어 있음"
elif [ "${FTC_SKIP_INSTALL:-}" = "1" ]; then
  echo "설치 건너뜀 (FTC_SKIP_INSTALL=1)"
else
  mkdir -p "$HOME/.claude/ftc"
  if ! run_with_progress "Claude Code 내려받고 설치하는 중, 1~2분 걸림" "$HOME/.claude/ftc/install.log" \
      bash -c "curl -fsSL https://claude.ai/install.sh | bash -s '$CC_VERSION'"; then
    echo "설치 실패. 같은 명령을 한 번 더 실행해 보고, 또 실패하면 화면을 캡처해 연구진에게 보내 주세요" >&2
    exit 1
  fi
fi
if ! grep -qs '\.local/bin' "$HOME/.bashrc"; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
fi
if [ "${FTC_SKIP_INSTALL:-}" != "1" ]; then
  current="$(claude --version 2>/dev/null | awk '{print $1}' || true)"
  if [ "$current" != "$CC_VERSION" ]; then
    echo "설치 확인 실패 (현재: ${current:-없음}). 화면을 캡처해 연구진에게 보내 주세요" >&2
    exit 1
  fi
  echo "설치 확인: $current"
fi

say "2/3 개인 키 입력"
has_key=0
if grep -qs '"ANTHROPIC_AUTH_TOKEN": "sk-br-v1-' "$HOME/.claude/settings.json" || [ -s "$HOME/.claude/ftc/anthropic-key" ]; then has_key=1; fi
while :; do
  if [ "$has_key" = 1 ]; then
    printf '연구진이 준 키를 붙여 넣고 Enter (기존 키를 그대로 쓰려면 Enter만). 키 대신 * 가 찍힘: '
  else
    printf '연구진이 준 키를 붙여 넣고 Enter. 키 대신 * 가 찍힘: '
  fi
  KEY="$(read_masked)" || KEY=""
  if [ -z "$KEY" ] && [ "$has_key" = 1 ]; then echo "기존 키 사용"; break; fi
  case "$KEY" in
    sk-br-v1-?*) echo "BizRouter 키 입력됨 (${#KEY}자, 끝 4자리 ${KEY: -4})"; break ;;
    sk-ant-?*) echo "Anthropic API 키 입력됨, 시험용 직접 연결 (${#KEY}자, 끝 4자리 ${KEY: -4})"; break ;;
    *) echo "키 형식이 다름 (sk-br-v1- 또는 sk-ant- 로 시작해야 함). 다시 붙여 넣어 주세요" ;;
  esac
done

say "3/3 설정 적용"
echo "설정 파일 쓰는 중"
FTC_KEY="$KEY" node "$DIR/setup.js"
unset KEY

say "완료"
echo "작업 폴더 ~/ftc 에서 새 터미널을 엽니다. 이제 claude 를 입력하면 시작됩니다"
cd "$HOME/ftc"
if [ -t 0 ] && [ "${FTC_NO_SHELL:-}" != "1" ]; then exec bash -i; fi
