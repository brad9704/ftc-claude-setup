import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

// 편집기 확장에는 설정의 상태줄(statusLine)이 나오지 않으므로, 같은 계산(~/.claude/ftc/statusline.js --plugin)을
// 불러 대화창 위의 작은 창(pane)에 큰 글씨로 띄운다. 창을 놓을 수 없는 화면이면 상태 줄 한 줄로 대신한다.
// 터미널에서는 statusline.js가 아무것도 내지 않으므로 창도 상태 줄도 생기지 않는다.
const PANE = 'ftc'
const TITLE = '예산과 탄소'
const info = atom({ plugin: 'ftc-status', key: 'text' } as const, '')

let busy = false
let opened = false
let placed = false

async function refresh($: EngineInterface): Promise<void> {
  if (busy) return
  busy = true
  try {
    const s = await $.session.info()
    const model = await $.session.model()
    const stdin = JSON.stringify({ transcript_path: s.transcriptPath, model: { id: model, display_name: model } })
    const r = await $.process.run(['sh', '-c', 'exec node "$HOME/.claude/ftc/statusline.js" --plugin'], { stdin, timeoutMs: 15000 })
    const text = r.stdout.trim()
    await update($, info, () => text)
    if (!text) {
      $.ui.status(undefined)
      return
    }
    if (!opened) {
      opened = true
      const o = await $.ui.open({ id: PANE, title: TITLE })
      placed = o.isPlaced
    }
    $.ui.status(placed ? undefined : text.split('\n')[0])
  } catch (err) {
    $.ui.log('ftc-status: ' + String(err), { to: 'debug' })
  } finally {
    busy = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'ftc', description: '예산과 탄소 창 다시 열기' })
    void refresh($)
    $.clock.every(30000, () => { void refresh($) })
    return started
  })

  on('command.run', { command: 'ftc' }, async $ => {
    const o = await $.ui.open({ id: PANE, title: TITLE })
    placed = o.isPlaced
    void refresh($)
    return { text: '예산과 탄소 창을 열었습니다' }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void refresh($)
    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const text = await read($, info)
    const [main = '', ...hints] = text.split('\n')
    const items = main.split(' | ').filter(x => x)
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
          {items.length === 0 && <Text size="heading">불러오는 중</Text>}
          {items.map((s, i) => (
            <Text size="heading" weight={i === 0 ? 'bold' : 'medium'}>{s}</Text>
          ))}
        </Box>
        {hints.map(s => (
          <Text size="body">{s}</Text>
        ))}
      </Box>
    )
  })
}
