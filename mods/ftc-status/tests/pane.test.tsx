import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'ftc-status',
  component: 'Pane',
  requestId: 'ftc',
  props: {
    title: '예산과 탄소',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('창에 상태 줄 항목이 한 줄씩 그려짐', async ($, on) => {
  on('state.get', () => ({
    value: { value: 'Claude Sonnet 5.5 (고성능) | 이번 턴 120원 | 이번 주 남은 예산 28,000원\n설정 업데이트 있음', version: 1 },
  }))
  for (const surface of ['vscode', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /이번 턴 120원/ }))?.text).toBe('이번 턴 120원')
    expect((await ui.find({ type: 'Text', text: /업데이트/ }))?.text).toBe('설정 업데이트 있음')
    await ui.unmount()
  }
})
