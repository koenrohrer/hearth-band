import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 12 },
  },
} as never

const stub = (on: (...a: never[]) => unknown) => {
  const o = on as unknown as (ev: string, h: (...a: unknown[]) => unknown) => void
  o('session.usage', () => ({ value: {
    startedAt: 0,
    context: { tokens: 120000, window: 1000000, percent: 12 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 42, resetsAt: '2030-01-01T00:00:00Z' },
      { kind: 'seven_day', percentUsed: 18, resetsAt: '2030-01-03T00:00:00Z' },
    ],
  } }))
  mock.clock(on as never, { now: Date.parse('2029-12-31T20:00:00Z') })
  o('settings.read', () => ({ value: { ultracode: true, autoCompactWindow: 400000 } }))
  o('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  o('ui.render', () => (globalThis as unknown as { h: (t: string, p: null, c: string) => unknown }).h('Text', null, 'engine band'))
}

test('the band draws the creature scene and animates', async ($, on) => {
  stub(on as never)
  const ui = await $.ui.mount({ plugin: 'hearth-band', surface: 'terminal', ...(BAND as object) } as never)
  const first = await ui.find({ type: 'Text', text: /5h/, in: 'hearth' })
  expect(first).toBeDefined()
  await ui.advance(500)
  expect(await ui.find({ type: 'Text', text: /cache/, in: 'hearth' })).toBeDefined()
  await ui.unmount()
})

test('a survey holds the band: the hook yields', async ($, on) => {
  stub(on as never)
  const quiet = { ...(BAND as { props: object }), props: { ...(BAND as { props: object }).props, hasSurvey: true } }
  const ui = await $.ui.mount({ plugin: 'hearth-band', surface: 'terminal', component: 'AbovePrompt', ...quiet } as never)
  expect(await ui.find({ type: 'Text', text: /engine band/ })).toBeDefined()
  await ui.unmount()
})
