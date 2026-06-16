#!/usr/bin/env bash
set -euo pipefail

PANEL_URL=""
REGISTRATION_TOKEN=""
INSTALL_DIR="/opt/apexgsp-daemon"
SERVICE_NAME="apexgspd"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --panel-url)
      PANEL_URL="${2:-}"
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

cat <<BANNER
ApexGSP daemon installer
Panel: $PANEL_URL
Install dir: $INSTALL_DIR
BANNER

mkdir -p "$INSTALL_DIR"

cat > "$INSTALL_DIR/.env" <<ENV
APEXGSP_PANEL_URL=$PANEL_URL
APEXGSP_REGISTRATION_TOKEN=$REGISTRATION_TOKEN
APEXGSP_NODE_ID=
APEXGSP_NODE_SECRET=
ENV

cat > "$INSTALL_DIR/apexgspd.sh" <<'DAEMON'
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

HOSTNAME_VALUE="$(hostname)"
DAEMON_VERSION="0.1.0"

log() {
  echo "[$(date -Is)] $*"
}

register_node() {
  if [[ -n "${APEXGSP_NODE_ID:-}" && -n "${APEXGSP_NODE_SECRET:-}" ]]; then
    log "Node already registered: $APEXGSP_NODE_ID"
    return
  fi

  log "Registration endpoint is not implemented yet in the hosted panel."
  log "Token saved locally. The next backend step is to add /api/node/register."
  log "Panel: ${APEXGSP_PANEL_URL}"
  log "Hostname: ${HOSTNAME_VALUE}"
}

heartbeat_loop() {
  while true; do
    log "Daemon running. Waiting for node registration API implementation."
    sleep 30
  done
}

register_node
heartbeat_loop
DAEMON

chmod +x "$INSTALL_DIR/apexgspd.sh"

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<SERVICE
[Unit]
Description=ApexGSP Daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/apexgspd.sh
Restart=always
RestartSec=10
User=root

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

cat <<DONE
ApexGSP daemon installed.

Useful commands:
  systemctl status $SERVICE_NAME --no-pager
  journalctl -u $SERVICE_NAME -f
  cat $INSTALL_DIR/.env

Note: the installer is now working, but daemon registration still needs the hosted /api/node/register endpoint.
DONE
