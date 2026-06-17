#!/usr/bin/env bash
set -euo pipefail

PANEL_URL=""
API_URL=""
REGISTRATION_TOKEN=""
INSTALL_DIR="/opt/apexgsp-daemon"
SERVICE_NAME="apexgspd"
REPO_ZIP_URL="https://github.com/ApexOrder/ApexGSPv3/archive/refs/heads/main.zip"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --panel-url)
      PANEL_URL="${2:-}"
      shift 2
      ;;
    --api-url)
      API_URL="${2:-}"
      shift 2
      ;;
    --token)
      REGISTRATION_TOKEN="${2:-}"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$PANEL_URL" ]]; then
  echo "Missing required argument: --panel-url" >&2
  exit 1
fi

if [[ -z "$REGISTRATION_TOKEN" ]]; then
  echo "Missing required argument: --token" >&2
  exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "Please run this installer as root, or pipe it to sudo bash." >&2
  exit 1
fi

PANEL_URL="${PANEL_URL%/}"
API_URL="${API_URL%/}"

if [[ -z "$API_URL" ]]; then
  API_URL="$PANEL_URL/node-api"
fi

cat <<BANNER
ApexGSP TypeScript daemon installer
Panel: $PANEL_URL
API: $API_URL
Install dir: $INSTALL_DIR
BANNER

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 20+ before running this installer."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install npm before running this installer."
  exit 1
fi

apt-get update -y >/dev/null
apt-get install -y curl unzip >/dev/null

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

curl -fsSL "$REPO_ZIP_URL" -o "$TMP_DIR/apexgsp.zip"
unzip -q "$TMP_DIR/apexgsp.zip" -d "$TMP_DIR"

mkdir -p "$INSTALL_DIR"
rsync -a --delete "$TMP_DIR/ApexGSPv3-main/daemon/" "$INSTALL_DIR/"

if [[ -f "$INSTALL_DIR/.env" ]]; then
  existing_node_id="$(grep '^APEXGSP_NODE_ID=' "$INSTALL_DIR/.env" | cut -d= -f2- || true)"
  existing_node_secret="$(grep '^APEXGSP_NODE_SECRET=' "$INSTALL_DIR/.env" | cut -d= -f2- || true)"
else
  existing_node_id=""
  existing_node_secret=""
fi

cat > "$INSTALL_DIR/.env" <<ENV
APEXGSP_PANEL_URL=$PANEL_URL
APEXGSP_API_URL=$API_URL
APEXGSP_REGISTRATION_TOKEN=$REGISTRATION_TOKEN
APEXGSP_NODE_ID=$existing_node_id
APEXGSP_NODE_SECRET=$existing_node_secret
APEXGSP_HEARTBEAT_INTERVAL_MS=30000
APEXGSP_JOB_POLL_INTERVAL_MS=30000
ENV

chmod 600 "$INSTALL_DIR/.env"

cd "$INSTALL_DIR"
npm install --omit=dev=false
npm run build

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<SERVICE
[Unit]
Description=ApexGSP Daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/env node $INSTALL_DIR/dist/index.js
Restart=always
RestartSec=10
User=root
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

cat <<DONE
ApexGSP TypeScript daemon installed.

Useful commands:
  systemctl status $SERVICE_NAME --no-pager
  journalctl -u $SERVICE_NAME -f
  cat $INSTALL_DIR/.env
DONE
