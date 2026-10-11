# hearth-band

A [Claude Code](https://claude.com/claude-code) mod that draws a small animated scene above the prompt: a pixel creature for the model you are running, sitting beside a campfire that burns down with your prompt cache.

| Model  | Creature |
| ------ | -------- |
| Haiku  | Bunny    |
| Sonnet | Fox      |
| Opus   | Dragon   |
| Fable  | Phoenix  |

Next to the scene:

- **Model and effort**, and a rainbow `ULTRACODE` chip (with sparkles) when ultracode is on.
- **5h and weekly limits** with time to reset.
- **Context** against your auto-compact window (it reads `autoCompactWindow` and the per-model `modelSettings` from your settings, not the full model window).
- **One quiet line** under the rest: session cost (`$1.23`, the `/cost` ledger), git branch with a dirty count (`*3`) and ahead/behind (`↑1 ↓2`), the `origin` remote as `owner/repo`, and your `git config user.name` (or `$USER`). On a narrow terminal the user, then the remote, drop out first.
- **Prompt cache** countdown. The fire is full while the cache is warm, shrinks to embers, and goes cold (the creature falls asleep) when the cache expires.

The creature's mood shows too: it breathes and blinks when calm, sleeps when the cache is cold, and looks alarmed when context is nearly full or the 5h limit is nearly spent. The scene animates at 5 fps.

## Install

In a Claude Code terminal session:

```
/plugin install hearth-band --marketplace koenrohrer/hearth-band
```

Answer `y` to add the marketplace, then pick a scope. The mod loads straight away.

## Options

Open `/config` and find **Prompt cache TTL**, or set it in settings:

```json
{ "pluginConfigs": { "hearth-band": { "cacheTtl": "1h" } } }
```

The mod API does not report the cache TTL, so choose the one your account gets (`5m` or `1h`); it matches `prompt_cache.ttl` in the status line JSON. The default is `5m`.

## Notes and limits

- Works on Linux and macOS. The mod is plain JavaScript with no files, processes or paths, so it has no OS-specific parts.
- It uses 24-bit colour and half-block characters. Use a truecolor terminal (iTerm2, Ghostty, kitty, WezTerm, VS Code, GNOME Terminal). macOS **Terminal.app does not support truecolor**, and the colours will look wrong there.
- If thin lines show between the pixel rows, set your terminal's line height to 1 (VS Code: `terminal.integrated.lineHeight`; also try `terminal.integrated.gpuAcceleration` set to `auto`).
- The band draws on the terminal and desktop surfaces. The VS Code extension panel has no `Client` element, so nothing is drawn there.
- The cache countdown starts from the last model response, so it can differ by a few seconds from the real expiry.
- Ultracode is read from your `ultracode` setting and from `/effort ultracode [off]` typed in the session. A session that started with ultracode already on from a toggle the mod never saw shows it off until you retype the command.
- Git info comes from read-only `git status` and `git remote get-url origin` runs (at most every 5 s, with a 3 s timeout). Only `owner/repo` is shown, never the full URL, so credentials in a remote can't leak onto the screen.
- The mod API is early access and may change.

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

- `hooks/register.tsx` gathers the data (usage, limits, settings, model, effort) and redraws once a second.
- `hooks/hearth.tsx` is the surface module: it owns the sprites, the fire and the 5 fps frame clock.

## Licence

MIT
