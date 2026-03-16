#!/usr/bin/env bash

# Nginx Proxy Manager Installation Script
# This script runs inside the LXC container to install NPM
#
# Can be run standalone:
#   curl -fsSL https://raw.githubusercontent.com/garethcheyne/nginx-proxy-manager-plus/main/scripts/proxmox/npm-install.sh | bash

set -euo pipefail

# Colors
RD="\033[01;31m"
GN="\033[1;32m"
YW="\033[33m"
BL="\033[36m"
CL="\033[m"
BOLD="\033[1m"

# Logging functions
msg_info() { echo -e "${BL}[INFO]${CL} $1"; }
msg_ok() { echo -e "${GN}[OK]${CL} $1"; }
msg_error() { echo -e "${RD}[ERROR]${CL} $1"; }

export DEBIAN_FRONTEND=noninteractive

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    msg_error "This script must be run as root"
    exit 1
fi

header() {
    clear
    cat <<"EOF"
    _   __      _               ____                         __  ___
   / | / /___ _(_)___  _  __   / __ \_________  _  ____  __  /  |/  /___ _____  ____ _____ ____  _____
  /  |/ / __ `/ / __ \| |/_/  / /_/ / ___/ __ \| |/_/ / / / / /|_/ / __ `/ __ \/ __ `/ __ `/ _ \/ ___/
 / /|  / /_/ / / / / />  <   / ____/ /  / /_/ />  </ /_/ / / /  / / /_/ / / / / /_/ / /_/ /  __/ /
/_/ |_/\__, /_/_/ /_/_/|_|  /_/   /_/   \____/_/|_|\__, / /_/  /_/\__,_/_/ /_/\__,_/\__, /\___/_/
      /____/                                      /____/                           /____/
EOF
    echo -e "\n${BL}${BOLD}Nginx Proxy Manager Installation${CL}\n"
}

install_dependencies() {
    msg_info "Updating system packages..."
    apt-get update
    apt-get upgrade -y

    msg_info "Installing dependencies..."
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

    msg_ok "Dependencies installed"
}

install_certbot() {
    msg_info "Setting up Certbot..."

    # Create Python virtual environment for certbot
    python3 -m venv /opt/certbot

    # Install certbot and plugins
    /opt/certbot/bin/pip install --upgrade pip
    /opt/certbot/bin/pip install certbot certbot-dns-cloudflare

    # Create symlink
    ln -sf /opt/certbot/bin/certbot /usr/bin/certbot

    msg_ok "Certbot installed"
}

install_openresty() {
    msg_info "Installing OpenResty..."

    # Add OpenResty GPG key and repository
    curl -fsSL https://openresty.org/package/pubkey.gpg | gpg --dearmor -o /usr/share/keyrings/openresty.gpg
    echo "deb [signed-by=/usr/share/keyrings/openresty.gpg] http://openresty.org/package/debian $(lsb_release -cs) main" > /etc/apt/sources.list.d/openresty.list

    apt-get update
    apt-get install -y openresty

    # Stop openresty for now, we'll configure it later
    systemctl stop openresty || true
    systemctl disable openresty || true

    msg_ok "OpenResty installed"
}

install_nodejs() {
    msg_info "Installing Node.js 22.x..."

    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs

    msg_info "Installing Yarn..."
    npm install -g yarn

    msg_ok "Node.js $(node --version) and Yarn installed"
}

setup_directories() {
    msg_info "Creating directories..."

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

    msg_ok "Directories created"
}

download_npm() {
    msg_info "Downloading Nginx Proxy Manager..."

    cd /opt

    # Get latest release version
    RELEASE=$(curl -fsSL https://api.github.com/repos/NginxProxyManager/nginx-proxy-manager/releases/latest | jq -r '.tag_name' | sed 's/v//')

    if [[ -z "$RELEASE" || "$RELEASE" == "null" ]]; then
        msg_error "Failed to get latest release. Using fallback version."
        RELEASE="2.12.3"
    fi

    msg_info "Installing version ${RELEASE}..."

    curl -fsSL "https://github.com/NginxProxyManager/nginx-proxy-manager/archive/refs/tags/v${RELEASE}.tar.gz" -o npm.tar.gz
    tar -xzf npm.tar.gz
    rm npm.tar.gz

    echo "${RELEASE}" > /opt/Nginx-Proxy-Manager_version.txt

    msg_ok "Downloaded NPM v${RELEASE}"
}

build_frontend() {
    msg_info "Building frontend (this may take a few minutes)..."

    cd "/opt/nginx-proxy-manager-$(cat /opt/Nginx-Proxy-Manager_version.txt)/frontend"

    # Set Node options for build
    export NODE_OPTIONS="--openssl-legacy-provider"

    # Install dependencies and build
    yarn install
    yarn build

    msg_ok "Frontend built"
}

build_backend() {
    msg_info "Building backend..."

    cd "/opt/nginx-proxy-manager-$(cat /opt/Nginx-Proxy-Manager_version.txt)/backend"

    # Install production dependencies
    yarn install --production

    msg_ok "Backend built"
}

deploy_npm() {
    msg_info "Deploying application..."

    local VERSION
    VERSION=$(cat /opt/Nginx-Proxy-Manager_version.txt)

    # Copy backend
    cp -r "/opt/nginx-proxy-manager-${VERSION}/backend/"* /opt/npm/

    # Copy frontend dist
    cp -r "/opt/nginx-proxy-manager-${VERSION}/frontend/dist" /opt/npm/frontend

    # Cleanup source
    rm -rf "/opt/nginx-proxy-manager-${VERSION}"

    msg_ok "Application deployed"
}

configure_database() {
    msg_info "Configuring database..."

    mkdir -p /opt/npm/config

    cat > /opt/npm/config/production.json << 'EOF'
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
EOF

    msg_ok "Database configured"
}

generate_ssl_certs() {
    msg_info "Generating default SSL certificates..."

    # Generate self-signed certificates for localhost
    if [[ ! -f /data/nginx/dummycert.pem ]] || [[ ! -f /data/nginx/dummykey.pem ]]; then
        openssl req -new -newkey rsa:2048 -days 3650 -nodes -x509 \
            -subj "/O=Nginx Proxy Manager/OU=Dummy Certificate/CN=localhost" \
            -keyout /data/nginx/dummykey.pem \
            -out /data/nginx/dummycert.pem 2>/dev/null
    fi

    msg_ok "SSL certificates generated"
}

configure_openresty() {
    msg_info "Configuring OpenResty..."

    # Create symlinks for compatibility
    ln -sf /usr/local/openresty/nginx/sbin/nginx /usr/sbin/nginx || true
    ln -sf /usr/bin/python3 /usr/bin/python || true

    # Main nginx config
    cat > /etc/openresty/nginx.conf << 'EOF'
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

    log_format proxy '$remote_addr - $remote_user [$time_local] "$request" '
                     '$status $body_bytes_sent "$http_referer" '
                     '"$http_user_agent" "$http_x_forwarded_for" '
                     '$upstream_response_time $request_time';

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

    # Proxy settings
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    proxy_buffer_size 4k;
    proxy_buffers 4 32k;
    proxy_busy_buffers_size 64k;
    proxy_temp_file_write_size 64k;

    # SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # Include configs
    include /etc/openresty/conf.d/*.conf;
    include /data/nginx/*/*.conf;
}

stream {
    include /data/nginx/stream/*.conf;
}
EOF

    # Create conf.d directory
    mkdir -p /etc/openresty/conf.d

    # Default server config
    cat > /etc/openresty/conf.d/default.conf << 'EOF'
# Default server - returns 444 for unknown hosts
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;
}

# Admin interface
server {
    listen 81 default_server;
    listen [::]:81 default_server;
    server_name _;

    root /opt/npm/frontend;
    index index.html;

    # API proxy
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

    # Frontend
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

    # Let's Encrypt challenge location
    mkdir -p /data/nginx/default_host
    cat > /data/nginx/default_host/letsencrypt-acme-challenge.conf << 'EOF'
# ACME challenge location for Let's Encrypt
location ^~ /.well-known/acme-challenge/ {
    default_type "text/plain";
    root /data/letsencrypt-acme-challenge;
}
EOF

    msg_ok "OpenResty configured"
}

create_systemd_services() {
    msg_info "Creating systemd services..."

    # NPM Backend service
    cat > /etc/systemd/system/npm.service << 'EOF'
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
EOF

    systemctl daemon-reload
    systemctl enable openresty
    systemctl enable npm

    msg_ok "Systemd services created"
}

start_services() {
    msg_info "Starting services..."

    systemctl start openresty
    systemctl start npm

    # Wait for backend to be ready
    local max_wait=30
    local count=0
    while ! curl -s http://127.0.0.1:3000/api/ > /dev/null 2>&1; do
        sleep 1
        ((count++))
        if [[ $count -ge $max_wait ]]; then
            msg_error "Backend failed to start within ${max_wait} seconds"
            echo "Check logs: journalctl -u npm -f"
            break
        fi
    done

    if [[ $count -lt $max_wait ]]; then
        msg_ok "Services started"
    fi
}

cleanup() {
    msg_info "Cleaning up..."

    apt-get autoremove -y
    apt-get clean
    rm -rf /var/lib/apt/lists/*

    msg_ok "Cleanup complete"
}

show_completion() {
    local IP
    IP=$(hostname -I | awk '{print $1}')

    echo
    echo -e "${GN}${BOLD}========================================${CL}"
    echo -e "${GN}${BOLD}  Installation Complete!${CL}"
    echo -e "${GN}${BOLD}========================================${CL}"
    echo
    echo -e "Nginx Proxy Manager is now running!"
    echo
    echo -e "  Admin Panel:  ${YW}http://${IP}:81${CL}"
    echo
    echo -e "${BOLD}Default credentials:${CL}"
    echo -e "  Email:     ${YW}admin@example.com${CL}"
    echo -e "  Password:  ${YW}changeme${CL}"
    echo
    echo -e "${RD}${BOLD}Change these credentials immediately!${CL}"
    echo
    echo -e "${BOLD}Service commands:${CL}"
    echo -e "  systemctl status npm        # Check backend status"
    echo -e "  systemctl status openresty  # Check nginx status"
    echo -e "  journalctl -u npm -f        # View backend logs"
    echo
}

# Main installation flow
main() {
    header
    install_dependencies
    install_certbot
    install_openresty
    install_nodejs
    setup_directories
    download_npm
    build_frontend
    build_backend
    deploy_npm
    configure_database
    generate_ssl_certs
    configure_openresty
    create_systemd_services
    start_services
    cleanup
    show_completion
}

# Run main function
main "$@"
