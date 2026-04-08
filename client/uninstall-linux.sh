#!/usr/bin/env bash
# uninstall-linux.sh — Remove UltraRAT Client systemd service
# Must be run as root (or with sudo)

set -euo pipefail

SERVICE_NAME="ultrarat-client"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if [[ $EUID -ne 0 ]]; then
  echo "[ERROR] This script must be run as root."
  echo "  Try: sudo bash uninstall-linux.sh"
  exit 1
fi

echo "Stopping and disabling ${SERVICE_NAME} ..."

systemctl stop    "${SERVICE_NAME}" 2>/dev/null || true
systemctl disable "${SERVICE_NAME}" 2>/dev/null || true

if [[ -f "$SERVICE_FILE" ]]; then
  rm -f "$SERVICE_FILE"
  echo "[✓] Removed $SERVICE_FILE"
else
  echo "[!] Unit file not found (already removed?)"
fi

systemctl daemon-reload

echo "[✓] Service '${SERVICE_NAME}' uninstalled."
