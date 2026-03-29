// lib/logger.js
// ─────────────────────────────────────────────────────────────
// Structured logging with Pino + Sentry error tracking
//
// IMPROVEMENT: replaces scattered console.log/console.error calls
// with structured JSON logs (Pino) and automatic error capture (Sentry).
//
// Without this: a Claude API failure or payment bounce at 3am is
// invisible. You only discover it when a guest complains the next day.
//
// With this:
//   - Every log line is structured JSON → searchable in Vercel/LogFlare
//   - Errors are captured to Sentry with full context (hotel, guest, room)
//   - Critical failures (Claude down, payment failed) trigger Sentry alerts
//   - Performance traces show which DB calls are slow
//
// Setup:
//   npm install pino @sentry/nextjs
//
//   Add to .env.local:
//     SENTRY_DSN=https://xxx@oyyy.ingest.sentry.io/zzz
//     LOG_LEVEL=info          (debug | info | warn | error)
//     NODE_ENV=production     (set automatically by Vercel)
//
//   In Sentry dashboard:
//     - Create a new project → Next.js
//     - Copy the DSN into your env var
//     - Set up an alert rule: "New issue" → email/Slack
// ─────────────────────────────────────────────────────────────

import pino from 'pino'

// ── Pino setup ────────────────────────────────────────────────
// In production (Vercel): plain JSON — fast, structured, searchable
// In development: pretty-print with colours for readability
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    env: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '0.1.5',
  },
  // Redact sensitive fields so they never appear in logs
  redact: {
    paths: [
      'guest.phone',
      'phone',
      'from',
      'authToken',
      'password',
      'stripe_payment_intent',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})

// ── Sentry setup ──────────────────────────────────────────────
// Lazy-loaded so missing DSN doesn't crash the app
let Sentry = null

async function getSentry() {
  if (Sentry) return Sentry
  if (!process.env.SENTRY_DSN) return null
  try {
    const mod = await import('@sentry/nextjs')
    if (!mod.isInitialized()) {
      mod.init({
        dsn:              process.env.SENTRY_DSN,
        environment:      process.env.NODE_ENV || 'development',
        tracesSampleRate: 0.1,   // 10% of requests get performance traces
        // Don't send errors in local dev (no DSN = no noise)
        enabled: !!process.env.SENTRY_DSN,
      })
    }
    Sentry = mod
    return Sentry
  } catch {
    return null
  }
}

// ── Context helpers ───────────────────────────────────────────
// Build a consistent context object attached to every log line.
// This makes filtering logs by hotel/guest/room trivial.

export function hotelCtx(hotel) {
  return {
    hotelId:   hotel?.id,
    hotelName: hotel?.name,
  }
}

export function guestCtx(guest) {
  return {
    guestId:    guest?.id,
    guestName:  guest?.name || null,
    room:       guest?.room || null,
    stayStatus: guest?.stay_status || null,
    language:   guest?.language || null,
  }
}

export function bookingCtx(booking) {
  return {
    bookingId:   booking?.id,
    bookingType: booking?.type,
    partnerId:   booking?.partner_id,
  }
}

// ── Main log functions ────────────────────────────────────────

export const log = {
  // Routine info — message received, Claude called, booking created
  info: (msg, ctx = {}) => logger.info(ctx, msg),

  // Something unexpected but recoverable
  warn: (msg, ctx = {}) => logger.warn(ctx, msg),

  // Error — always goes to Sentry too
  error: async (msg, err, ctx = {}) => {
    const errCtx = {
      ...ctx,
      err: err ? {
        message: err.message,
        name:    err.name,
        stack:   err.stack,
      } : undefined,
    }
    logger.error(errCtx, msg)

    // Send to Sentry with full context
    const sentry = await getSentry()
    if (sentry && err) {
      sentry.withScope(scope => {
        Object.entries(ctx).forEach(([key, val]) => {
          scope.setExtra(key, val)
        })
        if (ctx.hotelId)  scope.setTag('hotel_id',  ctx.hotelId)
        if (ctx.guestId)  scope.setTag('guest_id',  ctx.guestId)
        if (ctx.room)     scope.setTag('room',       ctx.room)
        scope.setLevel('error')
        sentry.captureException(err)
      })
    }
  },

  // Critical — wakes someone up. Use for: Claude API down, payment failed,
  // partner alert failed, escalation push failed.
  critical: async (msg, err, ctx = {}) => {
    const errCtx = {
      ...ctx,
      err: err ? { message: err.message, stack: err.stack } : undefined,
      CRITICAL: true,
    }
    logger.error(errCtx, `CRITICAL: ${msg}`)

    const sentry = await getSentry()
    if (sentry) {
      sentry.withScope(scope => {
        Object.entries(ctx).forEach(([key, val]) => scope.setExtra(key, val))
        if (ctx.hotelId) scope.setTag('hotel_id', ctx.hotelId)
        if (ctx.room)    scope.setTag('room',      ctx.room)
        scope.setLevel('fatal')
        if (err) sentry.captureException(err)
        else sentry.captureMessage(`CRITICAL: ${msg}`, 'fatal')
      })
    }
  },

  // Debug — only visible when LOG_LEVEL=debug
  debug: (msg, ctx = {}) => logger.debug(ctx, msg),

  // Performance timing — wrap slow operations
  // Usage: const end = log.time('db_query', { table: 'guests' })
  //        ... do work ...
  //        end()  // logs duration automatically
  time: (label, ctx = {}) => {
    const start = Date.now()
    return () => {
      const ms = Date.now() - start
      logger.info({ ...ctx, label, durationMs: ms }, `timing: ${label}`)
    }
  },
}

export default log
