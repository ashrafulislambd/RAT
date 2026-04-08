'use strict';

/**
 * Simple file logger with rotation.
 * Writes timestamped lines to a log file.
 * When the file exceeds maxFileSizeBytes it rotates (keeps up to maxFiles backups).
 *
 * pkg-aware: logs are always written next to the binary on the real filesystem,
 * never inside the read-only snapshot.
 */

const fs   = require('fs');
const path = require('path');

// ── pkg detection ─────────────────────────────────────────────────────────────
// When bundled by pkg, __dirname points inside the read-only snapshot.
// Write files next to the actual binary instead.
const IS_PKG   = typeof process.pkg !== 'undefined';
const BASE_DIR = IS_PKG ? path.dirname(process.execPath) : __dirname;

// ── Load logging config ───────────────────────────────────────────────────────
let config = {};
try {
  const raw = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'config.json'), 'utf8'));
  config = raw.logging || {};
} catch (_) {
  // use defaults
}

const LOG_DIR  = path.resolve(BASE_DIR, config.dir      || 'logs');
const LOG_FILE = path.join(LOG_DIR, config.filename      || 'service.log');
const MAX_SIZE  = config.maxFileSizeBytes                || 5 * 1024 * 1024; // 5 MB
const MAX_FILES = config.maxFiles                        || 3;

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function rotate() {
  try {
    const stat = fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE) : null;
    if (!stat || stat.size < MAX_SIZE) return;

    // Shift old backups: .2 -> .3, .1 -> .2, base -> .1
    for (let i = MAX_FILES - 1; i >= 1; i--) {
      const older = `${LOG_FILE}.${i}`;
      const newer = `${LOG_FILE}.${i + 1}`;
      if (fs.existsSync(older)) fs.renameSync(older, newer);
    }
    fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch (err) {
    process.stderr.write(`[logger] rotation error: ${err.message}\n`);
  }
}

function write(level, ...args) {
  rotate();
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${args.join(' ')}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (err) {
    process.stderr.write(`[logger] write error: ${err.message}\n`);
  }
  // Also mirror to console so systemd / Event Viewer journal captures it
  process.stdout.write(line);
}

module.exports = {
  info:  (...a) => write('INFO ', ...a),
  warn:  (...a) => write('WARN ', ...a),
  error: (...a) => write('ERROR', ...a),
  debug: (...a) => write('DEBUG', ...a),
  logFile: LOG_FILE,
};
