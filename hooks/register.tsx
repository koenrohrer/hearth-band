import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Info } from '../types'

const info = atom(
  { plugin: 'hearth-band', key: 'info' } as const,
  { model: '', effort: '', lastResponseAt: 0, ultraSession: null } as Info,
)

// Without a prompt-cache field in the mod API, the TTL is a setting (the statusline JSON's prompt_cache.ttl).
const TTL_SECONDS = { '5m': 300, '1h': 3600 } as const

// The default auto-compact window, as the statusline script derives it.
const defaultCompact = (window: number) => (window >= 1_000_000 ? 967_000 : Math.round(window * 0.92))

type Git = { branch: string; dirty: number; ahead: number; behind: number; remote: string }
const NO_GIT: Git = { branch: '', dirty: 0, ahead: 0, behind: 0, remote: '' }

// `owner/repo` of a remote URL (https, ssh or scp-style), never a credential or a host path.
export const remoteName = (url: string): string => {
  const m = /[:/]([^/:@\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(url.trim())
  return m ? m[1] : ''
}

// One `git status -sb` gives branch, upstream state and the dirty count.
export const parseStatus = (out: string): Omit<Git, 'remote'> => {
  const [head = '', ...rest] = out.split('\n').filter(Boolean)
  const line = head.replace(/^## /, '').replace(/^(?:No commits yet on|Initial commit on) /, '')
  const [refs = '', counts = ''] = line.split(' [')
  const name = refs.split('...')[0]
  const ahead = /ahead (\d+)/.exec(counts)
  const behind = /behind (\d+)/.exec(counts)
  const branch = !head.startsWith('## ') ? '' : name.startsWith('HEAD (no branch)') ? 'detached' : name

  return { branch, dirty: rest.length, ahead: ahead ? +ahead[1] : 0, behind: behind ? +behind[1] : 0 }
}

// Git is read at most every 5 s and the remote once per directory; a failure (no git, no repo)
// shows nothing. A module-level cache, which a hot reload simply refills.
let git = { at: 0, cwd: '', value: NO_GIT }
let remote = { cwd: '', value: '' }

async function readGit($: EngineInterface, now: number): Promise<Git> {
  const cwd = await $.session.cwd()
  if (cwd !== git.cwd || now - git.at > 5000) {
    git = { at: now, cwd, value: NO_GIT }
    try {
      const st = await $.process.run(['git', 'status', '-sb', '--porcelain'], { timeoutMs: 3000 })
      if (st.exitCode === 0) git.value = { ...parseStatus(st.stdout), remote: '' }
      if (cwd !== remote.cwd) {
        remote = { cwd, value: '' }
        const r = await $.process.run(['git', 'remote', 'get-url', 'origin'], { timeoutMs: 3000 })
        if (r.exitCode === 0) remote.value = remoteName(r.stdout)
      }
    } catch {
      git.value = NO_GIT
    }
    git.value = { ...git.value, remote: git.value.branch ? remote.value : '' }
  }

  return git.value
}

export const register: Register = (on, options) => {
  let user = ''

  const ttl = options.cacheTtl === '1h' ? TTL_SECONDS['1h'] : TTL_SECONDS['5m']

  on('session.start', async ($, e, next) => {
    // The band's data (usage, clock) refreshes once a second; the animation
    // itself runs in the Client at its own frame rate.
    $.clock.every(1000, () => $.ui.invalidate('ui.render'))

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    await update($, info, i => ({
      ...i,
      model: e.model,
      effort: e.effort === undefined ? '' : String(e.effort),
    }))
    const result = yield* next(e)
    const now = await $.clock.now()
    await update($, info, i => ({ ...i, lastResponseAt: now }))

    return result
  })

  // The session-only toggle (`/effort ultracode`, `... off`) is in no setting; read it as typed.
  on('prompt.submit', async ($, e, next) => {
    const m = /^\/effort\s+(\S+)(?:\s+(\S+))?/i.exec(e.text.trim())
    if (m) {
      const isOn = m[1].toLowerCase() === 'ultracode' && (m[2] ?? '').toLowerCase() !== 'off'
      await update($, info, i => ({ ...i, ultraSession: isOn }))
    }

    return next(e)
  }).catch((_$, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, info, i => ({ ...i, lastResponseAt: now }))

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Client } = $.ui.resolve(e)
    const i = await read($, info)
    const usage = await $.session.usage()
    const model = i.model || (await $.session.model())
    const five = usage.rateLimits.find(r => r.kind === 'five_hour')
    const week = usage.rateLimits.find(r => r.kind === 'seven_day')
    const now = await $.clock.now()
    const g = await readGit($, now)
    if (!user) {
      try {
        const n = await $.process.run(['git', 'config', 'user.name'], { timeoutMs: 3000 })
        user = n.exitCode === 0 ? n.stdout.trim() : ''
      } catch {
        user = ''
      }
      user = user || (await $.env.get('USER')) || ''
    }
    const settings = (await $.settings.read()) as {
      ultracode?: boolean
      autoCompactWindow?: number
      modelSettings?: Record<string, { autoCompactWindow?: number } | undefined>
    }
    const compact = Math.min(
      usage.context.window,
      settings.modelSettings?.[model]?.autoCompactWindow ??
        settings.autoCompactWindow ??
        defaultCompact(usage.context.window),
    )

    return (
      <Client
        key="hearth"
        module="./hearth.tsx"
        width={e.props.bodyColumns}
        props={{
          model,
          effort: i.effort,
          now,
          cost: usage.cost?.usd ?? null,
          git: g,
          user,
          cacheExpiresAt: i.lastResponseAt ? i.lastResponseAt + ttl * 1000 : 0,
          ttl,
          ctxTokens: usage.context.tokens ?? 0,
          ctxWindow: compact,
          ctxPercent: usage.context.window ? Math.min(100, ((usage.context.tokens ?? 0) / compact) * 100) : 0,
          ultra: i.ultraSession ?? settings.ultracode === true,
          five: five ? { pct: five.percentUsed, resetsAt: five.resetsAt ?? '' } : null,
          week: week ? { pct: week.percentUsed, resetsAt: week.resetsAt ?? '' } : null,
          isWorking: e.props.isWorking,
          columns: e.props.bodyColumns,
        }}
      />
    )
  })
}
