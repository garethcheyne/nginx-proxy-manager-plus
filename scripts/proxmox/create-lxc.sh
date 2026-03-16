#!/usr/bin/env bash

# Nginx Proxy Manager LXC Container Creation Script for Proxmox VE
# Run this script on your Proxmox host
#
# Usage: bash -c "$(curl -fsSL https://raw.githubusercontent.com/garethcheyne/nginx-proxy-manager-plus/main/scripts/proxmox/create-lxc.sh)"
# Or: bash create-lxc.sh

set -euo pipefail

# Colors
RD="\033[01;31m"
GN="\033[1;32m"
YW="\033[33m"
BL="\033[36m"
CL="\033[m"
BOLD="\033[1m"

# Default values
CTID=""
HOSTNAME="nginx-proxy-manager"
DISK_SIZE="4"
MEMORY="1024"
CORES="1"
STORAGE=""
BRIDGE="vmbr0"
IP_ADDRESS="dhcp"
GATEWAY=""
TEMPLATE="debian-12-standard"
PASSWORD=""
SSH_KEY=""
VERBOSE=false
START_AFTER_CREATE=true

# Application info
APP_NAME="Nginx Proxy Manager"
APP_VERSION="3.0"

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
    echo -e "\n${BL}${BOLD}${APP_NAME} v${APP_VERSION}${CL}\n"
}

msg_info() {
    echo -e "${BL}[INFO]${CL} $1"
}

msg_ok() {
    echo -e "${GN}[OK]${CL} $1"
}

msg_error() {
    echo -e "${RD}[ERROR]${CL} $1"
}

msg_warn() {
    echo -e "${YW}[WARN]${CL} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        msg_error "This script must be run as root on the Proxmox host"
        exit 1
    fi
}

check_pve() {
    if ! command -v pveversion &> /dev/null; then
        msg_error "This script must be run on a Proxmox VE host"
        exit 1
    fi
    PVE_VERSION=$(pveversion | cut -d '/' -f 2)
    msg_ok "Proxmox VE version: ${PVE_VERSION}"
}

get_next_ctid() {
    local id=100
    while pct status "$id" &>/dev/null; do
        ((id++))
    done
    echo "$id"
}

select_storage() {
    msg_info "Detecting available storage..."
    local STORAGE_LIST
    STORAGE_LIST=$(pvesm status -content rootdir | awk 'NR>1 {print $1}')

    if [[ -z "$STORAGE_LIST" ]]; then
        msg_error "No storage found for containers"
        exit 1
    fi

    local STORAGE_ARRAY=($STORAGE_LIST)

    if [[ ${#STORAGE_ARRAY[@]} -eq 1 ]]; then
        STORAGE="${STORAGE_ARRAY[0]}"
        msg_ok "Using storage: ${STORAGE}"
    else
        echo -e "\n${YW}Available storage:${CL}"
        select s in "${STORAGE_ARRAY[@]}"; do
            if [[ -n "$s" ]]; then
                STORAGE="$s"
                break
            fi
        done
        msg_ok "Selected storage: ${STORAGE}"
    fi
}

download_template() {
    msg_info "Checking for Debian 12 template..."

    local TEMPLATE_STORAGE
    TEMPLATE_STORAGE=$(pvesm status -content vztmpl | awk 'NR>1 {print $1}' | head -1)

    if [[ -z "$TEMPLATE_STORAGE" ]]; then
        msg_error "No storage available for templates"
        exit 1
    fi

    TEMPLATE="${TEMPLATE_STORAGE}:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst"

    if ! pveam list "$TEMPLATE_STORAGE" | grep -q "debian-12-standard"; then
        msg_info "Downloading Debian 12 template..."
        pveam update
        pveam download "$TEMPLATE_STORAGE" debian-12-standard_12.7-1_amd64.tar.zst
    fi
    msg_ok "Template ready: debian-12-standard"
}

configure_container() {
    echo -e "\n${YW}${BOLD}Container Configuration${CL}\n"

    # Container ID
    local default_ctid
    default_ctid=$(get_next_ctid)
    read -rp "Container ID [${default_ctid}]: " input_ctid
    CTID="${input_ctid:-$default_ctid}"

    # Hostname
    read -rp "Hostname [${HOSTNAME}]: " input_hostname
    HOSTNAME="${input_hostname:-$HOSTNAME}"

    # Disk size
    read -rp "Disk size in GB [${DISK_SIZE}]: " input_disk
    DISK_SIZE="${input_disk:-$DISK_SIZE}"

    # Memory
    read -rp "Memory in MB [${MEMORY}]: " input_memory
    MEMORY="${input_memory:-$MEMORY}"

    # CPU cores
    read -rp "CPU cores [${CORES}]: " input_cores
    CORES="${input_cores:-$CORES}"

    # Network
    read -rp "Bridge [${BRIDGE}]: " input_bridge
    BRIDGE="${input_bridge:-$BRIDGE}"

    read -rp "IP Address (dhcp or IP/CIDR) [${IP_ADDRESS}]: " input_ip
    IP_ADDRESS="${input_ip:-$IP_ADDRESS}"

    if [[ "$IP_ADDRESS" != "dhcp" ]]; then
        read -rp "Gateway (leave empty for none): " input_gateway
        GATEWAY="${input_gateway}"
    fi

    # Root password
    while [[ -z "$PASSWORD" ]]; do
        read -rsp "Root password (required): " PASSWORD
        echo
        if [[ -z "$PASSWORD" ]]; then
            msg_warn "Password cannot be empty"
        fi
    done

    # SSH key (optional)
    read -rp "SSH public key file (optional, leave empty to skip): " input_ssh
    if [[ -n "$input_ssh" && -f "$input_ssh" ]]; then
        SSH_KEY=$(cat "$input_ssh")
    fi

    # Summary
    echo -e "\n${GN}${BOLD}Configuration Summary:${CL}"
    echo -e "  Container ID: ${CTID}"
    echo -e "  Hostname:     ${HOSTNAME}"
    echo -e "  Storage:      ${STORAGE}"
    echo -e "  Disk:         ${DISK_SIZE}GB"
    echo -e "  Memory:       ${MEMORY}MB"
    echo -e "  CPU Cores:    ${CORES}"
    echo -e "  Network:      ${BRIDGE}"
    echo -e "  IP Address:   ${IP_ADDRESS}"
    [[ -n "$GATEWAY" ]] && echo -e "  Gateway:      ${GATEWAY}"

    echo
    read -rp "Continue with installation? [Y/n]: " confirm
    if [[ "${confirm,,}" == "n" ]]; then
        msg_warn "Installation cancelled"
        exit 0
    fi
}

create_container() {
    msg_info "Creating LXC container ${CTID}..."

    local NET_CONFIG="name=eth0,bridge=${BRIDGE}"
    if [[ "$IP_ADDRESS" == "dhcp" ]]; then
        NET_CONFIG+=",ip=dhcp"
    else
        NET_CONFIG+=",ip=${IP_ADDRESS}"
        [[ -n "$GATEWAY" ]] && NET_CONFIG+=",gw=${GATEWAY}"
    fi

    local CREATE_CMD=(
        pct create "$CTID" "$TEMPLATE"
        --hostname "$HOSTNAME"
        --storage "$STORAGE"
        --rootfs "${STORAGE}:${DISK_SIZE}"
        --memory "$MEMORY"
        --cores "$CORES"
        --net0 "$NET_CONFIG"
        --unprivileged 0
        --features nesting=1
        --onboot 1
        --password "$PASSWORD"
    )

    if [[ -n "$SSH_KEY" ]]; then
        CREATE_CMD+=(--ssh-public-keys <(echo "$SSH_KEY"))
    fi

    "${CREATE_CMD[@]}"

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
            exit 1
        fi
    done

    msg_ok "Container ${CTID} started"
}

install_npm() {
    msg_info "Installing Nginx Proxy Manager (this may take a few minutes)..."

    # Copy install script to container
    local INSTALL_SCRIPT
    INSTALL_SCRIPT=$(cat << 'EOFSCRIPT'
#!/bin/bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

echo "==> Updating system..."
apt-get update
apt-get upgrade -y

echo "==> Installing dependencies..."
apt-get install -y \
    curl \
    gnupg2 \
    ca-certificates \
    lsb-release \
    apt-transport-https \
    software-properties-common \
    git \
    build-essential \
    python3 \
    python3-pip \
    certbot \
    openssl \
    apache2-utils \
    logrotate \
    jq \
    sqlite3

echo "==> Installing Node.js 22.x..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

echo "==> Installing Yarn..."
npm install -g yarn

echo "==> Installing Nginx..."
curl -fsSL https://nginx.org/keys/nginx_signing.key | gpg --dearmor -o /usr/share/keyrings/nginx-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] http://nginx.org/packages/debian $(lsb_release -cs) nginx" > /etc/apt/sources.list.d/nginx.list
apt-get update
apt-get install -y nginx

systemctl enable nginx
systemctl stop nginx

echo "==> Creating NPM user and directories..."
useradd -r -s /bin/false -d /opt/npm npm || true

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
    /run/nginx \
    /tmp/nginx/body \
    /var/log/nginx \
    /var/lib/nginx/cache/public \
    /var/lib/nginx/cache/private \
    /var/cache/nginx/proxy_temp

echo "==> Downloading Nginx Proxy Manager..."
cd /opt
NPM_VERSION=$(curl -s https://api.github.com/repos/NginxProxyManager/nginx-proxy-manager/releases/latest | jq -r '.tag_name' | sed 's/v//')
if [[ -z "$NPM_VERSION" || "$NPM_VERSION" == "null" ]]; then
    NPM_VERSION="2.12.3"
fi
echo "Installing version: ${NPM_VERSION}"

curl -fsSL "https://github.com/NginxProxyManager/nginx-proxy-manager/archive/refs/tags/v${NPM_VERSION}.tar.gz" -o npm.tar.gz
tar -xzf npm.tar.gz
mv "nginx-proxy-manager-${NPM_VERSION}" npm-src
rm npm.tar.gz

echo "==> Building backend..."
cd /opt/npm-src/backend
yarn install --production

echo "==> Building frontend..."
cd /opt/npm-src/frontend
yarn install
yarn build

echo "==> Setting up application..."
cp -r /opt/npm-src/backend/* /opt/npm/
cp -r /opt/npm-src/frontend/dist /opt/npm/frontend

# Cleanup source
rm -rf /opt/npm-src

echo "==> Configuring Nginx..."
cat > /etc/nginx/nginx.conf << 'NGINXCONF'
user npm;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /run/nginx.pid;

events {
    worker_connections 1024;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
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

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;

    include /etc/nginx/conf.d/*.conf;
    include /data/nginx/*/*.conf;
}

stream {
    include /data/nginx/stream/*.conf;
}
NGINXCONF

cat > /etc/nginx/conf.d/default.conf << 'DEFAULTCONF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;

    location / {
        return 444;
    }
}

server {
    listen 81 default_server;
    listen [::]:81 default_server;

    server_name _;
    root /opt/npm/frontend;

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
cat > /etc/systemd/system/npm-backend.service << 'SERVICECONF'
[Unit]
Description=Nginx Proxy Manager Backend
After=network.target

[Service]
Type=simple
User=npm
Group=npm
WorkingDirectory=/opt/npm
ExecStart=/usr/bin/node --max_old_space_size=250 --abort_on_uncaught_exception index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICECONF

echo "==> Setting permissions..."
chown -R npm:npm /opt/npm
chown -R npm:npm /data
chown -R npm:npm /etc/letsencrypt
chown -R npm:npm /var/log/nginx
chown -R npm:npm /var/lib/nginx
chown -R npm:npm /var/cache/nginx
chown -R npm:npm /run/nginx
chown -R npm:npm /tmp/nginx

chmod 755 /opt/npm
chmod -R 755 /data

echo "==> Enabling services..."
systemctl daemon-reload
systemctl enable npm-backend
systemctl enable nginx

echo "==> Starting services..."
systemctl start npm-backend
systemctl start nginx

echo "==> Cleaning up..."
apt-get autoremove -y
apt-get clean
rm -rf /var/lib/apt/lists/*

echo "==> Installation complete!"
EOFSCRIPT
)

    # Execute install script in container
    pct exec "$CTID" -- bash -c "$INSTALL_SCRIPT"

    msg_ok "Nginx Proxy Manager installed"
}

get_container_ip() {
    local ip
    ip=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')
    echo "$ip"
}

show_completion() {
    local ip
    ip=$(get_container_ip)

    echo
    echo -e "${GN}${BOLD}========================================${CL}"
    echo -e "${GN}${BOLD}  Installation Complete!${CL}"
    echo -e "${GN}${BOLD}========================================${CL}"
    echo
    echo -e "${BL}Nginx Proxy Manager is now running!${CL}"
    echo
    echo -e "  Admin Panel:     ${YW}http://${ip}:81${CL}"
    echo -e "  Container ID:    ${YW}${CTID}${CL}"
    echo
    echo -e "${BOLD}Default Login:${CL}"
    echo -e "  Email:     admin@example.com"
    echo -e "  Password:  changeme"
    echo
    echo -e "${RD}Please change the default credentials immediately!${CL}"
    echo
    echo -e "${BOLD}Useful Commands:${CL}"
    echo -e "  pct enter ${CTID}              # Enter container shell"
    echo -e "  pct stop ${CTID}               # Stop container"
    echo -e "  pct start ${CTID}              # Start container"
    echo -e "  systemctl status npm-backend   # Check backend status (inside container)"
    echo -e "  systemctl status nginx         # Check nginx status (inside container)"
    echo
}

main() {
    header
    check_root
    check_pve
    select_storage
    download_template
    configure_container
    create_container
    start_container
    install_npm
    show_completion
}

# Run main function
main "$@"
