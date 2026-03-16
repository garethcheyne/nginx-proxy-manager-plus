#!/usr/bin/env bash

# Nginx Proxy Manager - Proxmox LXC Container Creator
# Standalone script - no external dependencies required
#
# Run on Proxmox host:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/garethcheyne/nginx-proxy-manager-plus/main/scripts/proxmox/create-npm-lxc.sh)"
#
# Or download and run:
#   curl -fsSL https://raw.githubusercontent.com/garethcheyne/nginx-proxy-manager-plus/main/scripts/proxmox/create-npm-lxc.sh -o create-npm-lxc.sh
#   chmod +x create-npm-lxc.sh
#   ./create-npm-lxc.sh

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================
APP="Nginx-Proxy-Manager"
APP_TITLE="Nginx Proxy Manager"

# Container defaults
DEFAULT_CTID=""
DEFAULT_HOSTNAME="npm"
DEFAULT_DISK="8"
DEFAULT_RAM="2048"
DEFAULT_CORES="2"
DEFAULT_BRIDGE="vmbr0"
DEFAULT_IP="dhcp"

# Colors
RD='\033[01;31m'
GN='\033[1;32m'
YW='\033[33m'
BL='\033[36m'
WH='\033[37m'
CL='\033[m'
BOLD='\033[1m'

# ============================================================================
# Helper Functions
# ============================================================================
msg_info() { echo -e "${BL}[INFO]${CL} $1"; }
msg_ok() { echo -e "${GN}[OK]${CL} $1"; }
msg_error() { echo -e "${RD}[ERROR]${CL} $1"; exit 1; }
msg_warn() { echo -e "${YW}[WARN]${CL} $1"; }

header() {
    clear
    cat <<"EOF"
    _   __      _               ____                         __  ___
   / | / /___ _(_)___  _  __   / __ \_________  _  ____  __  /  |/  /___ _____  ____ _____ ____  _____
  /  |/ / __ `/ / __ \| |/_/  / /_/ / ___/ __ \| |/_/ / / / / /|_/ / __ `/ __ \/ __ `/ __ `/ _ \/ ___/
 / /|  / /_/ / / / / />  <   / ____/ /  / /_/ />  </ /_/ / / /  / / /_/ / / / / /_/ / /_/ /  __/ /
/_/ |_/\__, /_/_/ /_/_/|_|  /_/   /_/   \____/_/|_|\__, / /_/  /_/\__,_/_/ /_/\__,_/\__, /\___/_/
      /____/                                      /____/                           /____/

                    Proxmox LXC Container Installation Script
EOF
    echo -e "\n${BL}${BOLD}${APP_TITLE}${CL}\n"
}

# ============================================================================
# Validation Functions
# ============================================================================
check_root() {
    if [[ $EUID -ne 0 ]]; then
        msg_error "This script must be run as root on the Proxmox host"
    fi
}

check_proxmox() {
    if ! command -v pveversion &> /dev/null; then
        msg_error "This script must be run on a Proxmox VE host"
    fi
    local pve_version
    pve_version=$(pveversion | cut -d'/' -f2)
    msg_ok "Proxmox VE ${pve_version} detected"
}

# ============================================================================
# Storage Functions
# ============================================================================
get_storage_list() {
    pvesm status -content rootdir 2>/dev/null | awk 'NR>1 {print $1}'
}

get_template_storage() {
    pvesm status -content vztmpl 2>/dev/null | awk 'NR>1 {print $1}' | head -1
}

select_storage() {
    msg_info "Detecting available storage..."

    local storage_list
    storage_list=$(get_storage_list)

    if [[ -z "$storage_list" ]]; then
        msg_error "No storage available for containers"
    fi

    local -a storages
    readarray -t storages <<< "$storage_list"

    if [[ ${#storages[@]} -eq 1 ]]; then
        STORAGE="${storages[0]}"
        msg_ok "Using storage: ${STORAGE}"
    else
        echo -e "\n${YW}Available storage:${CL}"
        PS3="Select storage: "
        select s in "${storages[@]}"; do
            if [[ -n "$s" ]]; then
                STORAGE="$s"
                break
            fi
        done
        msg_ok "Selected storage: ${STORAGE}"
    fi
}

# ============================================================================
# Template Functions
# ============================================================================
ensure_template() {
    msg_info "Checking for Debian 12 template..."

    local template_storage
    template_storage=$(get_template_storage)

    if [[ -z "$template_storage" ]]; then
        msg_error "No storage available for templates"
    fi

    # Check if template exists
    if ! pveam list "$template_storage" 2>/dev/null | grep -q "debian-12-standard"; then
        msg_info "Downloading Debian 12 template..."
        pveam update
        # Get latest Debian 12 template
        local template_name
        template_name=$(pveam available --section system 2>/dev/null | grep "debian-12-standard" | awk '{print $2}' | sort -V | tail -1)
        if [[ -z "$template_name" ]]; then
            template_name="debian-12-standard_12.7-1_amd64.tar.zst"
        fi
        pveam download "$template_storage" "$template_name"
    fi

    # Get the actual template path
    TEMPLATE=$(pveam list "$template_storage" 2>/dev/null | grep "debian-12-standard" | awk '{print $1}' | sort -V | tail -1)

    if [[ -z "$TEMPLATE" ]]; then
        msg_error "Failed to find Debian 12 template"
    fi

    msg_ok "Template ready: ${TEMPLATE}"
}

# ============================================================================
# Container ID Functions
# ============================================================================
get_next_ctid() {
    local id=100
    while pct status "$id" &>/dev/null || qm status "$id" &>/dev/null; do
        ((id++))
    done
    echo "$id"
}

# ============================================================================
# Configuration UI
# ============================================================================
configure_container() {
    echo -e "\n${YW}${BOLD}Container Configuration${CL}\n"

    # Container ID
    local default_ctid
    default_ctid=$(get_next_ctid)
    read -rp "Container ID [${default_ctid}]: " CTID
    CTID="${CTID:-$default_ctid}"

    # Validate CTID
    if pct status "$CTID" &>/dev/null || qm status "$CTID" &>/dev/null; then
        msg_error "ID ${CTID} is already in use"
    fi

    # Hostname
    read -rp "Hostname [${DEFAULT_HOSTNAME}]: " HOSTNAME
    HOSTNAME="${HOSTNAME:-$DEFAULT_HOSTNAME}"

    # Disk size
    read -rp "Disk size in GB [${DEFAULT_DISK}]: " DISK_SIZE
    DISK_SIZE="${DISK_SIZE:-$DEFAULT_DISK}"

    # Memory
    read -rp "Memory in MB [${DEFAULT_RAM}]: " RAM
    RAM="${RAM:-$DEFAULT_RAM}"

    # CPU cores
    read -rp "CPU cores [${DEFAULT_CORES}]: " CORES
    CORES="${CORES:-$DEFAULT_CORES}"

    # Network bridge
    read -rp "Network bridge [${DEFAULT_BRIDGE}]: " BRIDGE
    BRIDGE="${BRIDGE:-$DEFAULT_BRIDGE}"

    # IP address
    read -rp "IP Address (dhcp or IP/CIDR, e.g., 192.168.1.100/24) [${DEFAULT_IP}]: " IP_ADDR
    IP_ADDR="${IP_ADDR:-$DEFAULT_IP}"

    # Gateway (only if static IP)
    GATEWAY=""
    if [[ "$IP_ADDR" != "dhcp" ]]; then
        read -rp "Gateway IP (leave empty to skip): " GATEWAY
    fi

    # Root password
    PASSWORD=""
    while [[ -z "$PASSWORD" ]]; do
        read -rsp "Root password (required): " PASSWORD
        echo
        if [[ -z "$PASSWORD" ]]; then
            msg_warn "Password cannot be empty"
        fi
    done

    # SSH key (optional)
    SSH_KEY=""
    read -rp "Path to SSH public key file (optional, press Enter to skip): " SSH_KEY_PATH
    if [[ -n "$SSH_KEY_PATH" && -f "$SSH_KEY_PATH" ]]; then
        SSH_KEY=$(cat "$SSH_KEY_PATH")
    fi

    # Summary
    echo -e "\n${GN}${BOLD}Configuration Summary:${CL}"
    echo -e "  Container ID:  ${CTID}"
    echo -e "  Hostname:      ${HOSTNAME}"
    echo -e "  Storage:       ${STORAGE}"
    echo -e "  Disk:          ${DISK_SIZE}GB"
    echo -e "  Memory:        ${RAM}MB"
    echo -e "  CPU Cores:     ${CORES}"
    echo -e "  Network:       ${BRIDGE}"
    echo -e "  IP Address:    ${IP_ADDR}"
    [[ -n "$GATEWAY" ]] && echo -e "  Gateway:       ${GATEWAY}"
    [[ -n "$SSH_KEY" ]] && echo -e "  SSH Key:       Configured"

    echo
    read -rp "Proceed with installation? [Y/n]: " confirm
    if [[ "${confirm,,}" == "n" ]]; then
        msg_warn "Installation cancelled"
        exit 0
    fi
}

# ============================================================================
# Container Creation
# ============================================================================
create_container() {
    msg_info "Creating LXC container ${CTID}..."

    # Build network config
    local net_config="name=eth0,bridge=${BRIDGE}"
    if [[ "$IP_ADDR" == "dhcp" ]]; then
        net_config+=",ip=dhcp"
    else
        net_config+=",ip=${IP_ADDR}"
        [[ -n "$GATEWAY" ]] && net_config+=",gw=${GATEWAY}"
    fi

    # Create container
    local -a pct_args=(
        "$CTID" "$TEMPLATE"
        --hostname "$HOSTNAME"
        --storage "$STORAGE"
        --rootfs "${STORAGE}:${DISK_SIZE}"
        --memory "$RAM"
        --cores "$CORES"
        --net0 "$net_config"
        --unprivileged 0
        --features nesting=1
        --onboot 1
        --password "$PASSWORD"
    )

    pct create "${pct_args[@]}"

    msg_ok "Container ${CTID} created"
}

start_container() {
    msg_info "Starting container ${CTID}..."
    pct start "$CTID"

    # Wait for container to be ready
    local max_wait=30
    local count=0
    while ! pct exec "$CTID" -- test -f /etc/os-release 2>/dev/null; do
        sleep 1
        ((count++))
        if [[ $count -ge $max_wait ]]; then
            msg_error "Container failed to start within ${max_wait} seconds"
        fi
    done

    msg_ok "Container ${CTID} started"
}

# ============================================================================
# NPM Installation Script (runs inside container)
# ============================================================================
get_install_script() {
    cat << 'INSTALL_SCRIPT'
#!/bin/bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

echo "==> Updating system..."
apt-get update
apt-get upgrade -y

echo "==> Installing dependencies..."
apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    apt-transport-https \
    software-properties-common \
    git \
    build-essential \
    python3 \
    python3-dev \
    python3-pip \
    python3-venv \
    python3-cffi \
    apache2-utils \
    logrotate \
    jq \
    openssl \
    sqlite3

echo "==> Setting up Certbot..."
python3 -m venv /opt/certbot
/opt/certbot/bin/pip install --upgrade pip
/opt/certbot/bin/pip install certbot certbot-dns-cloudflare
ln -sf /opt/certbot/bin/certbot /usr/bin/certbot

echo "==> Installing OpenResty..."
curl -fsSL https://openresty.org/package/pubkey.gpg | gpg --dearmor -o /usr/share/keyrings/openresty.gpg
echo "deb [signed-by=/usr/share/keyrings/openresty.gpg] http://openresty.org/package/debian $(lsb_release -cs) openresty" > /etc/apt/sources.list.d/openresty.list
apt-get update
apt-get install -y openresty
systemctl stop openresty || true

echo "==> Installing Node.js 22.x..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g yarn

echo "==> Creating directories..."
mkdir -p \
    /opt/npm \
    /data \
    /data/nginx \
    /data/custom_ssl \
    /data/logs \
    /data/access \
    /data/nginx/default_host \
    /data/nginx/default_www \
    /data/nginx/proxy_host \
    /data/nginx/redirection_host \
    /data/nginx/stream \
    /data/nginx/dead_host \
    /data/nginx/temp \
    /data/letsencrypt-acme-challenge \
    /etc/letsencrypt \
    /var/log/nginx \
    /var/lib/nginx/cache/public \
    /var/lib/nginx/cache/private \
    /var/cache/nginx/proxy_temp \
    /run/nginx \
    /tmp/nginx/body

echo "==> Downloading Nginx Proxy Manager..."
cd /opt
RELEASE=$(curl -fsSL https://api.github.com/repos/NginxProxyManager/nginx-proxy-manager/releases/latest | jq -r '.tag_name' | sed 's/v//')
if [[ -z "$RELEASE" || "$RELEASE" == "null" ]]; then
    RELEASE="2.12.3"
fi
echo "Installing version: ${RELEASE}"

curl -fsSL "https://github.com/NginxProxyManager/nginx-proxy-manager/archive/refs/tags/v${RELEASE}.tar.gz" -o npm.tar.gz
tar -xzf npm.tar.gz
rm npm.tar.gz
echo "${RELEASE}" > /opt/Nginx-Proxy-Manager_version.txt

echo "==> Building frontend..."
cd "/opt/nginx-proxy-manager-${RELEASE}/frontend"
export NODE_OPTIONS="--openssl-legacy-provider"
yarn install
echo "==> Compiling locale files..."
yarn locale-compile
yarn build

echo "==> Building backend..."
cd "/opt/nginx-proxy-manager-${RELEASE}/backend"
yarn install --production

echo "==> Deploying application..."
cp -r "/opt/nginx-proxy-manager-${RELEASE}/backend/"* /opt/npm/
cp -r "/opt/nginx-proxy-manager-${RELEASE}/frontend/dist" /opt/npm/frontend
rm -rf "/opt/nginx-proxy-manager-${RELEASE}"

echo "==> Configuring database..."
mkdir -p /opt/npm/config
cat > /opt/npm/config/production.json << 'DBCONF'
{
  "database": {
    "engine": "knex-native",
    "knex": {
      "client": "sqlite3",
      "connection": {
        "filename": "/data/database.sqlite"
      },
      "useNullAsDefault": true
    }
  }
}
DBCONF

echo "==> Generating SSL certificates..."
openssl req -new -newkey rsa:2048 -days 3650 -nodes -x509 \
    -subj "/O=Nginx Proxy Manager/OU=Dummy Certificate/CN=localhost" \
    -keyout /data/nginx/dummykey.pem \
    -out /data/nginx/dummycert.pem 2>/dev/null

echo "==> Configuring OpenResty..."
ln -sf /usr/local/openresty/nginx/sbin/nginx /usr/sbin/nginx || true
ln -sf /usr/bin/python3 /usr/bin/python || true

cat > /etc/openresty/nginx.conf << 'NGINXCONF'
user root;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /run/nginx.pid;

events {
    worker_connections 1024;
    multi_accept on;
}

http {
    include /usr/local/openresty/nginx/conf/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    server_tokens off;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    include /etc/openresty/conf.d/*.conf;
    include /data/nginx/*/*.conf;
}

stream {
    include /data/nginx/stream/*.conf;
}
NGINXCONF

mkdir -p /etc/openresty/conf.d
cat > /etc/openresty/conf.d/default.conf << 'DEFAULTCONF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;
}

server {
    listen 81 default_server;
    listen [::]:81 default_server;
    server_name _;

    root /opt/npm/frontend;
    index index.html;

    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
DEFAULTCONF

echo "==> Creating systemd service..."
cat > /etc/systemd/system/npm.service << 'SERVICECONF'
[Unit]
Description=Nginx Proxy Manager Backend
After=network.target openresty.service
Wants=openresty.service

[Service]
Type=simple
WorkingDirectory=/opt/npm
ExecStart=/usr/bin/node --max_old_space_size=250 --abort_on_uncaught_exception index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICECONF

systemctl daemon-reload
systemctl enable openresty
systemctl enable npm

echo "==> Starting services..."
systemctl start openresty
systemctl start npm

echo "==> Cleaning up..."
apt-get autoremove -y
apt-get clean
rm -rf /var/lib/apt/lists/*

echo "==> Installation complete!"
INSTALL_SCRIPT
}

# ============================================================================
# Install NPM in Container
# ============================================================================
install_npm() {
    msg_info "Installing Nginx Proxy Manager (this may take several minutes)..."

    # Execute install script in container
    pct exec "$CTID" -- bash -c "$(get_install_script)"

    msg_ok "Nginx Proxy Manager installed"
}

# ============================================================================
# Get Container IP
# ============================================================================
get_container_ip() {
    pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}'
}

# ============================================================================
# Completion Message
# ============================================================================
show_completion() {
    local ip
    ip=$(get_container_ip)

    echo
    echo -e "${GN}${BOLD}╔════════════════════════════════════════════════════════════╗${CL}"
    echo -e "${GN}${BOLD}║            Installation Complete!                          ║${CL}"
    echo -e "${GN}${BOLD}╚════════════════════════════════════════════════════════════╝${CL}"
    echo
    echo -e "${BL}${BOLD}Nginx Proxy Manager is now running!${CL}"
    echo
    echo -e "  ${WH}Admin Panel:${CL}   ${YW}http://${ip}:81${CL}"
    echo -e "  ${WH}Container ID:${CL}  ${YW}${CTID}${CL}"
    echo -e "  ${WH}Hostname:${CL}      ${YW}${HOSTNAME}${CL}"
    echo
    echo -e "${BOLD}Default Login Credentials:${CL}"
    echo -e "  ${WH}Email:${CL}     ${YW}admin@example.com${CL}"
    echo -e "  ${WH}Password:${CL}  ${YW}changeme${CL}"
    echo
    echo -e "${RD}${BOLD}⚠  Please change these credentials immediately!${CL}"
    echo
    echo -e "${BOLD}Useful Commands:${CL}"
    echo -e "  ${BL}pct enter ${CTID}${CL}              # Enter container shell"
    echo -e "  ${BL}pct stop ${CTID}${CL}               # Stop container"
    echo -e "  ${BL}pct start ${CTID}${CL}              # Start container"
    echo
    echo -e "${BOLD}Inside container:${CL}"
    echo -e "  ${BL}systemctl status npm${CL}          # Check backend status"
    echo -e "  ${BL}systemctl status openresty${CL}    # Check nginx status"
    echo -e "  ${BL}journalctl -u npm -f${CL}          # View backend logs"
    echo
}

# ============================================================================
# Main Execution
# ============================================================================
main() {
    header
    check_root
    check_proxmox
    select_storage
    ensure_template
    configure_container
    create_container
    start_container
    install_npm
    show_completion
}

# Run
main "$@"
