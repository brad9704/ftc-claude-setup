import type { EngineInterface, Register } from 'claude-code'

// 편집기 확장에는 설정의 상태줄(statusLine)이 나오지 않으므로, 같은 계산(~/.claude/ftc/statusline.js --plugin)을
// 불러 그 결과를 이 플러그인의 상태 줄로 띄운다. 터미널에서는 statusline.js가 아무것도 내지 않아 표시되지 않는다.
let busy = false

async function refresh($: EngineInterface): Promise<void> {
  if (busy) return
  busy = true
  try {
    const info = await $.session.info()
    const model = await $.session.model()
    const stdin = JSON.stringify({ transcript_path: info.transcriptPath, model: { id: model, display_name: model } })
    const r = await $.process.run(['sh', '-c', 'exec node "$HOME/.claude/ftc/statusline.js" --plugin'], { stdin, timeoutMs: 15000 })
    const text = r.stdout.trim()
    $.ui.status(text ? text : undefined)
  } catch (err) {
    $.ui.log('ftc-status: ' + String(err), { to: 'debug' })
  } finally {
    busy = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    void refresh($)
    $.clock.every(30000, () => { void refresh($) })
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void refresh($)
    return done
  })
}
