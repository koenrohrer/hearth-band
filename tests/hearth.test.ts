import { expect, mock, test } from 'claude-code/testing'

import { parseStatus, remoteName, ultraFrom } from '../hooks/register'

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
  o('session.cwd', () => ({ value: '/work/repo' }))
  o('process.run', (...a: unknown[]) => {
    const argv = ((a[1] as { argv?: string[] })?.argv ?? []).join(' ')
    if (argv.startsWith('git status')) return { value: { exitCode: 0, stdout: '## main...origin/main [ahead 2]\n M a.ts\n?? b.ts\n', stderr: '' } }
    if (argv.startsWith('git remote')) return { value: { exitCode: 0, stdout: 'https://user:pw@github.com/acme/widget.git\n', stderr: '' } }
    return { value: { exitCode: 0, stdout: 'Ada\n', stderr: '' } }
  })
  o('env.get', () => ({ value: 'ada' }))
  o('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  o('ui.render', () => (globalThis as unknown as { h: (t: string, p: null, c: string) => unknown }).h('Text', null, 'engine band'))
}

test('the band draws the creature scene and animates', async ($, on) => {
  stub(on as never)
  const ui = await $.ui.mount({ plugin: 'hearth-band', surface: 'terminal', ...(BAND as object) } as never)
  const first = await ui.find({ type: 'Text', text: /5h/, in: 'hearth' })
  expect(first).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /main/, in: 'hearth' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /acme\/widget/, in: 'hearth' })).toBeDefined()
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

test('git status and remote parse without leaking credentials', () => {
  expect(parseStatus('## main...origin/main [ahead 2, behind 1]\n M a\n')).toEqual({ branch: 'main', dirty: 1, ahead: 2, behind: 1 })
  expect(parseStatus('## No commits yet on dev\n')).toEqual({ branch: 'dev', dirty: 0, ahead: 0, behind: 0 })
  expect(parseStatus('## HEAD (no branch)\n').branch).toBe('detached')
  expect(parseStatus('').branch).toBe('')
  expect(remoteName('https://user:pw@github.com/acme/widget.git')).toBe('acme/widget')
  expect(remoteName('git@github.com:acme/widget.git')).toBe('acme/widget')
  expect(remoteName('')).toBe('')
})

test('ultracode follows what /effort printed', () => {
  expect(ultraFrom('Ultracode on (this session only): dynamic workflows on every task. Effort stays high.')).toBe(true)
  expect(ultraFrom('Ultracode off. Effort stays high.')).toBe(false)
  expect(ultraFrom('Set effort level to high (saved as your default for new sessions) · Ultracode off')).toBe(false)
  expect(ultraFrom('<local-command-stdout>Ultracode on (this session only)</local-command-stdout>')).toBe(true)
  expect(ultraFrom('Effort level: high')).toBeUndefined()
})
