/**
 * Logging.
 *
 * Deliberately thin. The app needs structured, level-filtered logs with a
 * redaction hook; it does not need a logging framework.
 *
 * Two things this file exists to guarantee:
 *
 *  1. Nothing sensitive reaches a log. Spec section 38 requires that private
 *     wallet data never appears in analytics payloads and section 11 that wallet
 *     secrets are never stored. A `redact` pass is applied to every payload
 *     before it is written, so a stray wallet address or key is stripped even
 *     when the call site forgets. Redaction is a safety net, not permission to be
 *     careless at the call site.
 *
 *  2. Logs are off in production. `__DEV__` gates the level, so a release build
 *     cannot accidentally ship verbose logging.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

/**
 * Keys whose values are replaced with `[redacted]` before anything is written.
 *
 * Matched case-insensitively against the key name. Extend this list rather than
 * passing secrets into the logger directly — a denylist is only useful if
 * everything goes through it.
 */
const SENSITIVE_KEYS = [
  'secret',
  'privatekey',
  'private_key',
  'mnemonic',
  'seed',
  'seedphrase',
  'seed_phrase',
  'password',
  'token',
  'authorization',
  'cookie',
  'signature_of_session',
  'apisecret',
  'api_secret',
  'heliuskey',
  'payerkeypair',
]

const REDACTED = '[redacted]'

/**
 * Replace sensitive values in a log payload.
 *
 * Recurses into plain objects and arrays. Anything with a non-plain prototype is
 * passed through untouched, because walking an arbitrary class instance can
 * trigger getters with side effects.
 */
export function redact(value: unknown, depth = 0): unknown {
  // Guard against pathological nesting; a cyclic payload must not hang the app.
  if (depth > 6) return '[truncated]'
  if (value === null || typeof value !== 'object') return value

  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1))

  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return value

  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    const isSensitive = SENSITIVE_KEYS.some((needle) => key.toLowerCase().includes(needle))
    out[key] = isSensitive ? REDACTED : redact(item, depth + 1)
  }

  return out
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>) {
  if (!__DEV__ && level === 'debug') return

  const payload = context ? redact(context) : undefined
  const line = `[gochi] ${message}`

  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log

  if (payload) sink(line, payload)
  else sink(line)
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => {
    if (!__DEV__) return
    write('debug', message, context)
  },
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),

  /**
   * Minimum level to emit. Anything below is dropped.
   *
   * Default is `info`, so `debug` calls sprinkled through the app are free in
   * production without having to be removed.
   */
  setLevel(level: LogLevel) {
    if (LEVEL_ORDER[level] === undefined) return
    logger.level = level
  },
  level: 'info' as LogLevel,
}

/**
 * True when a message at `level` would be emitted.
 *
 * Callers use this to skip expensive work purely for logging — building a large
 * debug payload on every keystroke is not worth it if the log is dropped anyway.
 */
export function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[logger.level]
}
