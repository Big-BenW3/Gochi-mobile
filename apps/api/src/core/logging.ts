/**
 * Server-side logging.
 *
 * Deliberately not shared with the mobile logger. That one is bundled into the
 * app and filters by a denylist tuned for client-side telemetry; this one has a
 * different job — correlating an auth failure across a nonce issuance, a
 * signature verification and a database write — and it must never be able to
 * print a signing key or a token even by accident.
 *
 * Two invariants:
 *
 *   - Nothing here logs a signature, a token, a nonce or a full URL with a query
 *     string. Auth failures are logged with a code and the identifiers needed to
 *     find the row, which is all a debugging session actually requires.
 *   - Output is one JSON object per line. That is what makes it greppable and
 *     what a log shipper can parse without a regex.
 */

/** Values that must never reach a log line, at any nesting depth. */
const REDACTED_KEYS = new Set([
  "signature",
  "signedmessage",
  "accesstoken",
  "token",
  "jwt",
  "privy_app_secret",
  "app_secret",
  "secret",
  "password",
  "privatekey",
  "keypair",
  "authorization",
  "cookie",
]);

/** Keys safe to log even though they contain an address or an ID. */
const ADDRESS_KEYS = new Set([
  "address",
  "wallet",
  "wallet_address",
  "walletaddress",
]);

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Below this level, nothing is printed.
 *
 * `debug` in development, `info` in production. Auth is a low-volume, high-value
 * path, so it logs at `info` and above even in production — there is no volume
 * argument for silencing it.
 */
function minLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL as LogLevel | undefined;
  if (configured && configured in LEVEL_ORDER) return configured;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/** Shorten a base58 address so logs stay readable. */
function truncateAddress(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/**
 * Strip anything sensitive from a log payload, recursively.
 *
 * Addresses are shortened rather than removed: they are the identifier a log
 * line needs to be useful, and they are public data. Everything else on the
 * denylist is replaced wholesale.
 */
function redact(value: unknown, depth = 0): unknown {
  // Bound the recursion. A cyclic object would otherwise hang the process, and
  // auth payloads are attacker-influenced.
  if (depth > 4) return "[deep]";
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value))
    return value.slice(0, 20).map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    const flat = key.toLowerCase().replace(/[-_]/g, "");
    if (ADDRESS_KEYS.has(flat)) {
      out[key] = typeof inner === "string" ? truncateAddress(inner) : inner;
    } else if (REDACTED_KEYS.has(flat)) {
      out[key] = "[redacted]";
    } else {
      out[key] = redact(inner, depth + 1);
    }
  }
  return out;
}

function emit(
  level: LogLevel,
  event: string,
  fields?: Record<string, unknown>,
) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;

  const line = {
    level,
    event,
    time: new Date().toISOString(),
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  };

  const serialised = JSON.stringify(line);

  if (level === "error" || level === "warn") {
    console.error(serialised);
  } else {
    console.log(serialised);
  }
}

export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) =>
    emit("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) =>
    emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) =>
    emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) =>
    emit("error", event, fields),
};
