#!/usr/bin/env bash
# install-linux.sh — Install UltraRAT Client as a systemd service
# Supports both compiled binary (no Node.js needed) and node fallback.
# Must be run as root (or with sudo).

set -euo pipefail

SERVICE_NAME="ultrarat-client"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
CLIENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Must be root ──────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "[ERROR] This script must be run as root."
  echo "  Try: sudo bash install-linux.sh"
  exit 1
fi

# ── Auto-detect how to launch the client ─────────────────────────────────────
# Priority: compiled binary (arm64) > compiled binary (x64) > node fallback

EXEC_START=""

if [[ -f "${CLIENT_DIR}/ultrarat-client-linux-arm64" ]]; then
  EXEC_START="${CLIENT_DIR}/ultrarat-client-linux-arm64"
  chmod +x "$EXEC_START"
  echo "[i] Mode     : compiled binary (arm64)"
elif [[ -f "${CLIENT_DIR}/ultrarat-client-linux-x64" ]]; then
  EXEC_START="${CLIENT_DIR}/ultrarat-client-linux-x64"
  chmod +x "$EXEC_START"
  echo "[i] Mode     : compiled binary (x64)"
else
  NODE_BIN="$(command -v node 2>/dev/null || echo '')"
  if [[ -z "$NODE_BIN" ]]; then
    echo "[ERROR] No compiled binary found and Node.js is not installed."
    echo ""
    echo "  Option A — use the compiled binary (recommended, no Node.js needed):"
    echo "    Build on your dev machine:  npm run build:linux-x64"
    echo "    Copy ultrarat-client-linux-x64 to this directory, then re-run."
    echo ""
    echo "  Option B — install Node.js on this machine:"
    echo "    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
    echo "    apt-get install -y nodejs"
    exit 1
  fi
  EXEC_START="${NODE_BIN} ${CLIENT_DIR}/service.js"
  echo "[i] Mode     : node fallback (Node.js $(node --version))"
fi

echo "[i] ExecStart: $EXEC_START"
echo "[i] Client   : $CLIENT_DIR"

# ── Read server URL ───────────────────────────────────────────────────────────
SERVER_URL="${RAT_SERVER_URL:-}"
if [[ -z "$SERVER_URL" ]]; then
  if command -v python3 &>/dev/null; then
    SERVER_URL=$(python3 -c \
      "import json,sys; print(json.load(open('${CLIENT_DIR}/config.json'))['serverUrl'])" \
      2>/dev/null || echo "ws://localhost:3000")
  else
    SERVER_URL="ws://localhost:3000"
  fi
fi

echo "[i] Server   : $SERVER_URL"
echo ""

# ── Write systemd unit file ───────────────────────────────────────────────────
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=UltraRAT Client Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${CLIENT_DIR}
ExecStart=${EXEC_START}
Environment=RAT_SERVER_URL=${SERVER_URL}
Environment=NODE_ENV=production
Restart=on-failure
RestartSec=5s
StartLimitIntervalSec=0

[Install]
WantedBy=multi-user.target
EOF

echo "[✓] Unit file written to $SERVICE_FILE"

# ── Enable and start ──────────────────────────────────────────────────────────
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl start  "${SERVICE_NAME}"

echo ""
echo "[✓] Service '${SERVICE_NAME}' installed, enabled, and started."
echo ""
echo "Useful commands:"
echo "  systemctl status  ${SERVICE_NAME}"
echo "  systemctl stop    ${SERVICE_NAME}"
echo "  systemctl restart ${SERVICE_NAME}"
echo "  journalctl -u     ${SERVICE_NAME} -f"
echo "  sudo bash uninstall-linux.sh   # to remove"

