export type Info = {
  model: string
  effort: string
  lastResponseAt: number
  /** Set by a typed `/effort ultracode [off]`; null until then, so the setting decides. */
  ultraSession: boolean | null
}

declare module 'claude-code' {
  interface PluginState {
    'hearth-band': { info: Info }
  }
}
