#!/usr/bin/env bash
set -euo pipefail

PANEL_URL=""
API_URL=""
REGISTRATION_TOKEN=""
INSTALL_DIR="/opt/apexgsp-daemon"
SERVICE_NAME="apexgspd"

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
ApexGSP daemon installer
Panel: $PANEL_URL
API: $API_URL
Install dir: $INSTALL_DIR
BANNER

mkdir -p "$INSTALL_DIR"

cat > "$INSTALL_DIR/.env" <<ENV
APEXGSP_PANEL_URL=$PANEL_URL
APEXGSP_API_URL=$API_URL
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

json_get() {
  python3 -c "import json,sys; print(json.load(sys.stdin).get('$1',''))"
}

save_env_value() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

register_node() {
  if [[ -n "${APEXGSP_NODE_ID:-}" && -n "${APEXGSP_NODE_SECRET:-}" ]]; then
    log "Node already registered: $APEXGSP_NODE_ID"
    return
  fi

  log "Registering node with ApexGSP..."

  response="$(curl -fsS -X POST "${APEXGSP_API_URL}/register" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"${APEXGSP_REGISTRATION_TOKEN}\",\"hostname\":\"${HOSTNAME_VALUE}\",\"daemon_version\":\"${DAEMON_VERSION}\"}")"

  node_id="$(printf '%s' "$response" | json_get node_id)"
  node_secret="$(printf '%s' "$response" | json_get node_secret)"

  if [[ -z "$node_id" || -z "$node_secret" ]]; then
    log "Registration response did not include node credentials."
    log "$response"
    exit 1
  fi

  save_env_value "APEXGSP_NODE_ID" "$node_id"
  save_env_value "APEXGSP_NODE_SECRET" "$node_secret"

  APEXGSP_NODE_ID="$node_id"
  APEXGSP_NODE_SECRET="$node_secret"

  log "Node registered: $APEXGSP_NODE_ID"
}

send_heartbeat() {
  curl -fsS -X POST "${APEXGSP_API_URL}/heartbeat" \
    -H "Content-Type: application/json" \
    -d "{\"node_id\":\"${APEXGSP_NODE_ID}\",\"node_secret\":\"${APEXGSP_NODE_SECRET}\",\"daemon_version\":\"${DAEMON_VERSION}\",\"metadata\":{\"hostname\":\"${HOSTNAME_VALUE}\"}}" >/dev/null
}

heartbeat_loop() {
  while true; do
    if send_heartbeat; then
      log "Heartbeat sent."
    else
      log "Heartbeat failed."
    fi
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
DONE
