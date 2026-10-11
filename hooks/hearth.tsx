type RGB = [number, number, number]
type Limit = { pct: number; resetsAt: string } | null
type Props = {
  model: string
  effort: string
  now: number
  cacheExpiresAt: number
  ttl: number
  ctxTokens: number
  ctxWindow: number
  ctxPercent: number
  ultra: boolean
  cost: number | null
  git: { branch: string; dirty: number; ahead: number; behind: number; remote: string }
  user: string
  five: Limit
  week: Limit
  isWorking: boolean
  columns: number
}
type Cell = { top?: RGB; bot?: RGB; ch?: string; fg?: RGB }
type Run = { text: string; fg?: RGB; bg?: RGB; bold?: boolean; dim?: boolean }

const BOX = 16
const FIRE_X = 18
const GW = 26
const GH = 7
const PAD = 1 // empty cell rows above the scene; one more is left below it

const c = (s: string): RGB => s.split(';').map(Number) as RGB

type Sprite = { eye: RGB; pal: Record<string, RGB>; rows: string[]; tint: RGB; name: string }

const SPRITES: Record<string, Sprite> = {
  haiku: {
    name: 'Haiku', tint: c('244;244;255'), eye: c('27;27;47'),
    pal: { w: c('241;238;248'), p: c('255;159;189'), n: c('255;111;154'), m: c('184;174;221') },
    rows: ['.ww..ww.', '.wp..pw.', '.wp..pw.', 'wwwwwwww', 'wewwwwew', 'wpwnnwpw', '.wwmmww.', '..wwww..'],
  },
  sonnet: {
    name: 'Sonnet', tint: c('255;138;43'), eye: c('27;27;47'),
    pal: { o: c('255;138;43'), w: c('255;241;224'), n: c('42;27;46'), k: c('90;47;31') },
    rows: ['kk......kk', 'ooo....ooo', 'oooooooooo', 'ooeooooeoo', 'wwooooooww', '.wwwnnwww.', '..wwwwww..', '...wwww...'],
  },
  opus: {
    name: 'Opus', tint: c('169;139;255'), eye: c('255;225;74'),
    pal: { d: c('138;77;255'), l: c('185;160;255'), h: c('255;200;87'), n: c('42;27;78'), w: c('255;255;255') },
    rows: ['hh..........hh', '.hh........hh.', '..dddddddddd..', '.dddddddddddd.', '.ddeddddddedd.', '.dddddddddddd.',
      '..dllllllllld.', '..dlnllllnld..', '...dllllllld..', '....wd....dw..'],
  },
  fable: {
    name: 'Fable', tint: c('255;90;54'), eye: c('42;27;46'),
    pal: { r: c('255;90;54'), y: c('255;194;51'), o: c('255;138;26') },
    rows: ['.....o..o.....', '.....oyyo.....', 'r...oyyyyo...r', 'rr..yeyyey..rr', 'rrr.yyooyy.rrr', '.rrryyyyyyrrr.',
      '..rrryyyyrrr..', '...orryyrro...', '....o.yy.o....', '...o..yy..o...'],
  },
}

const family = (id: string) => (/haiku/i.test(id) ? 'haiku' : /opus/i.test(id) ? 'opus' : /fable/i.test(id) ? 'fable' : 'sonnet')

// A small deterministic PRNG, so a frame is a pure function of its number.
const rng = (seed: number) => {
  let s = (seed * 2654435761) >>> 0
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0
    return (s >>> 8) / 16777216
  }
}

const FG: RGB = c('246;237;228')
const MUTE: RGB = c('154;146;168')
const DIM: RGB = c('90;84;104')
const GREEN: RGB = c('88;214;141')
const AMBER: RGB = c('255;194;51')
const RED: RGB = c('255;107;107')
const ORANGE: RGB = c('255;138;26')

const RAINBOW: RGB[] = ['255;200;87', '255;154;77', '255;107;139', '197;139;255', '122;162;255'].map(c)
const rainbow = (text: string, frame: number): Run[] =>
  [...text].map((ch, i) => ({ text: ch, fg: RAINBOW[(i + Math.floor(frame / 2)) % RAINBOW.length], bold: true }))

const pctColor = (p: number, warn: number, crit: number) => (p >= crit ? RED : p >= warn ? AMBER : GREEN)

const buildScene = (p: Props, frame: number, cstate: string, L: number, mood: string): Cell[] => {
  const grid: Cell[] = Array.from({ length: GW * GH }, () => ({}))
  const r = rng(frame)
  const sp = SPRITES[family(p.model)]
  const nr = sp.rows.length
  const w = sp.rows[0].length
  const x0 = Math.floor((BOX - w) / 2)
  // The creature stands on the logs' baseline (the last pixel row of the scene) and bobs
  // upward, so no frame pushes a pixel past the bottom edge.
  const base = 2 * (PAD + 5) - 1
  const eye = mood === 'asleep' ? c('120;120;140') : mood === 'stressed' ? c('255;77;109') : sp.eye
  // breathing: the whole creature bobs one half-cell every ~1.2 s while calm
  const bob = mood === 'asleep' || mood === 'calm' ? (Math.floor(frame / 4) % 2 ? 1 : 0) : 0
  const top = base - nr + 1 - bob
  for (let y = 0; y < nr; y++) {
    for (let x = 0; x < w; x++) {
      const ch = sp.rows[y][x]
      if (ch === '.') continue
      const col = ch === 'e' ? eye : sp.pal[ch]
      const yy = top + y
      const idx = Math.floor(yy / 2) * GW + x0 + x
      if (idx < 0 || idx >= grid.length) continue
      if (yy % 2) grid[idx].bot = col
      else grid[idx].top = col
    }
  }
  // blink
  if (mood !== 'asleep' && frame % 25 === 0) {
    for (const cell of grid) {
      if (cell.top && cell.top[0] === sp.eye[0] && cell.top[1] === sp.eye[1] && cell.top[2] === sp.eye[2]) cell.top = sp.tint
      if (cell.bot && cell.bot[0] === sp.eye[0] && cell.bot[1] === sp.eye[1] && cell.bot[2] === sp.eye[2]) cell.bot = sp.tint
    }
  }
  const fpx = (x: number, y: number, col: RGB) => {
    const py = y + 2 * PAD
    const i = Math.floor(py / 2) * GW + FIRE_X + x
    if (py % 2) grid[i].bot = col
    else grid[i].top = col
  }
  let logA = c('139;90;60'), logB = c('107;68;41'), logT = c('168;112;63')
  if (cstate === 'embers') [logA, logB, logT] = [c('180;69;42'), c('138;51;32'), c('217;87;58')]
  else if (cstate === 'cold' || cstate === 'none') [logA, logB, logT] = [c('74;76;102'), c('58;60;85'), c('88;90;120')]
  if (cstate === 'lit') {
    const h = Math.min(8, 2 + Math.floor((L * 6) / 1000))
    for (let k = 0; k < h; k++) {
      const y = 7 - k
      let half = Math.floor((34 * (h - k)) / h)
      if (k > 0) half += Math.floor(r() * 7) - 3
      if (half < 5) half = 5
      const cx = 35 + Math.floor(((Math.floor(r() * 7) - 3) * k) / 4)
      const fr = Math.floor((k * 100) / h)
      for (let x = 0; x < 8; x++) {
        const d = Math.abs(x * 10 - cx)
        if (d > half) continue
        let col: RGB
        if (d < (half * 45) / 100 && fr < 75) col = fr < 30 ? c('255;138;26') : fr < 55 ? c('255;194;51') : c('255;241;168')
        else col = fr < 22 ? c('255;61;31') : fr < 50 ? c('255;122;26') : fr < 78 ? c('255;181;46') : c('255;232;138')
        fpx(x, y, col)
      }
    }
  } else if (cstate === 'embers') {
    const sparks = [c('192;57;43'), c('255;90;54'), c('138;51;32')]
    for (let i = 0; i < 3; i++) if (r() < 0.7) fpx(2 + Math.floor(r() * 4), 7 - Math.floor(r() * 2), sparks[Math.floor(r() * 3)])
  } else if (cstate === 'cold' && r() < 0.6) fpx(3 + Math.floor(r() * 2), 7 - Math.floor(r() * 3), c('74;76;102'))
  for (let x = 1; x <= 6; x++) fpx(x, 8, logT)
  for (let x = 0; x < 8; x++) fpx(x, 9, [0, 2, 5, 7].includes(x) ? logB : logA)
  if (p.ultra) {
    const spark = ['✦', '·', '+', '✧']
    for (let k = 0; k < 6; k++) {
      if (r() >= 0.55) continue
      const sx = x0 - 2 + Math.floor(r() * (w + 4))
      const sy = Math.floor(r() * (GH - 1))
      const si = sy * GW + sx
      if (sx < 0 || sx >= BOX || grid[si].top || grid[si].bot || grid[si].ch) continue
      grid[si].ch = spark[Math.floor(r() * 4)]
      grid[si].fg = RAINBOW[Math.floor(r() * 5)]
    }
  }
  // a mood glyph above the creature
  const gy = Math.max(0, Math.floor((base - nr + 1) / 2) - 1)
  const gi = gy * GW + Math.min(BOX - 1, x0 + w)
  const tick = Math.floor(frame / 5) % 2
  const g =
    mood === 'asleep' ? { ch: tick ? 'z' : 'Z', fg: c('154;166;255') }
    : mood === 'stressed' ? (tick ? { ch: "'", fg: c('110;168;255') } : { ch: '!', fg: c('255;107;107') })
    : mood === 'calm' && tick ? { ch: '♪', fg: c('79;209;197') }
    : null
  if (g && !grid[gi].top && !grid[gi].bot) {
    grid[gi].ch = g.ch
    grid[gi].fg = g.fg
  }
  return grid
}

// Merge neighbouring cells of one colour pair into runs, so a row is a few Text nodes.
const sceneRow = (grid: Cell[], y: number): Run[] => {
  const runs: Run[] = []
  const push = (text: string, fg?: RGB, bg?: RGB) => {
    const last = runs[runs.length - 1]
    if (last && last.fg === fg && last.bg === bg) last.text += text
    else runs.push({ text, fg, bg })
  }
  for (let x = 0; x < GW; x++) {
    const cell = grid[y * GW + x]
    if (cell.ch) push(cell.ch, cell.fg)
    else if (cell.top && cell.bot) push('▀', cell.top, cell.bot)
    else if (cell.top) push('▀', cell.top)
    else if (cell.bot) push('▄', cell.bot)
    else push(' ')
  }
  return runs
}

const rgb = (v?: RGB) => (v ? `rgb(${v[0]},${v[1]},${v[2]})` : undefined)

const bar = (pct: number, cells: number, fg: RGB): Run[] => {
  const on = Math.max(0, Math.min(cells, Math.round((pct / 100) * cells)))
  return [{ text: '▰'.repeat(on), fg }, { text: '▱'.repeat(cells - on), fg: DIM }]
}

const fmtDur = (sec: number) => {
  if (sec < 60) return `${Math.max(0, Math.floor(sec))}s`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h${String(m % 60).padStart(2, '0')}` : `${Math.floor(h / 24)}d${h % 24}h`
}

const limRow = (label: string, l: Limit, now: number, barCells: number): Run[] => {
  if (!l) return [{ text: label.padEnd(6), fg: MUTE }, { text: 'no data', fg: DIM }]
  const col = pctColor(l.pct, 70, 90)
  const reset = l.resetsAt ? Math.max(0, (Date.parse(l.resetsAt) - now) / 1000) : 0
  return [
    { text: label.padEnd(6), fg: MUTE },
    ...bar(l.pct, barCells, col),
    { text: ` ${Math.round(l.pct)}%`, fg: col, bold: true },
    ...(l.resetsAt ? [{ text: `  resets ${fmtDur(reset)}`, fg: MUTE }] : []),
  ]
}

const Hearth = (p: Props, surface: any) => {
  const { Box, Text } = surface.elements
  const frame: number = surface.state ?? 0
  if (surface.state === undefined) surface.every(200, () => surface.setState((surface.state ?? 0) + 1))

  // `now` is the hook's reading from its last redraw, a second at most ago.
  const now = p.now
  const cacheRem = p.cacheExpiresAt ? Math.max(0, (p.cacheExpiresAt - now) / 1000) : 0
  const L = p.cacheExpiresAt ? Math.min(1000, Math.round((cacheRem * 1000) / p.ttl)) : 0
  const cstate = !p.cacheExpiresAt ? 'none' : cacheRem <= 0 ? 'cold' : L <= 100 ? 'embers' : 'lit'
  const ctxPct = Math.min(100, p.ctxPercent)
  const fiveDry = p.five && p.five.pct >= 95
  const mood = ctxPct >= 92 || fiveDry ? 'stressed' : p.isWorking ? 'focus' : cstate === 'cold' ? 'asleep' : 'calm'

  const sp = SPRITES[family(p.model)]
  const grid = buildScene(p, frame, cstate, L, mood)
  const wide = p.columns >= 100
  const bw = wide ? 22 : 10

  const title: Run[] = [
    { text: sp.name, fg: sp.tint, bold: true },
    { text: p.effort ? `  ${p.effort}` : '', fg: MUTE },
    { text: mood === 'focus' ? '  working' : '', fg: AMBER },
    ...(p.ultra ? [{ text: '  ' }, ...rainbow('ULTRACODE', frame)] : []),
  ]
  const ctxCol = pctColor(ctxPct, 55, 87)
  const ctx: Run[] = [
    { text: 'ctx'.padEnd(6), fg: MUTE },
    ...bar(ctxPct, bw, ctxCol),
    { text: ` ${Math.round(ctxPct)}%`, fg: ctxCol, bold: true },
    { text: `  ${Math.round(p.ctxTokens / 1000)}k / ${Math.round(p.ctxWindow / 1000)}k`, fg: MUTE },
  ]
  const cells = wide ? 12 : 8
  const on = Math.floor((L * cells) / 1000)
  const fc = L <= 330 ? RED : ORANGE
  const mm = Math.floor(cacheRem / 60)
  const ss = String(Math.floor(cacheRem % 60)).padStart(2, '0')
  const word =
    cstate === 'lit' ? (L > 660 ? ['roaring', GREEN] : L > 330 ? ['steady', GREEN] : ['burning low', AMBER])
    : cstate === 'embers' ? ['embers', RED]
    : cstate === 'cold' ? ['COLD', RED]
    : ['no cache yet', MUTE]
  const cache: Run[] = [
    { text: 'cache'.padEnd(6), fg: MUTE },
    { text: `${mm}:${ss}`, fg: FG, bold: true },
    { text: ' ' },
    { text: '▰'.repeat(on), fg: fc },
    { text: '▱'.repeat(cells - on), fg: DIM },
    { text: '  ' },
    { text: word[0] as string, fg: word[1] as RGB, bold: true },
  ]
  const g = p.git
  const gitRow: Run[] = g.branch
    ? [
        { text: 'git'.padEnd(6), fg: MUTE },
        { text: g.branch, fg: c('79;209;197'), bold: true },
        ...(g.dirty ? [{ text: `*${g.dirty}`, fg: AMBER }] : []),
        ...(g.ahead ? [{ text: ` ↑${g.ahead}`, fg: GREEN }] : []),
        ...(g.behind ? [{ text: ` ↓${g.behind}`, fg: RED }] : []),
        ...(g.remote ? [{ text: `  ${g.remote}`, fg: MUTE }] : []),
      ]
    : [{ text: 'git'.padEnd(6), fg: MUTE }, { text: 'not a repo', fg: DIM }]
  const usd = p.cost === null ? '' : p.cost < 10 ? p.cost.toFixed(2) : p.cost.toFixed(1)
  const costRow: Run[] = [
    { text: 'cost'.padEnd(6), fg: MUTE },
    { text: p.cost === null ? 'n/a' : `$${usd}`, fg: FG, bold: true },
    ...(p.user ? [{ text: `  ${p.user}`, fg: MUTE }] : []),
  ]
  const info: Run[][] = [title, limRow('5h', p.five, now, bw), limRow('week', p.week, now, bw), ctx, cache, gitRow, costRow]

  const draw = (runs: Run[]) =>
    runs.map(r => (
      <Text color={rgb(r.fg)} backgroundColor={rgb(r.bg)} bold={r.bold}>
        {r.text}
      </Text>
    ))

  return (
    <Box flexDirection="column">
      {Array.from({ length: GH }, (_, y) => (
        <Box flexDirection="row">
          <Text color={rgb(DIM)}>▏</Text>
          {draw(sceneRow(grid, y))}
          <Text>{'  '}</Text>
          {draw(info[y])}
        </Box>
      ))}
    </Box>
  )
}

export default Hearth
