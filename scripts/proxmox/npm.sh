#!/usr/bin/env bash

# Nginx Proxy Manager LXC Container Script for Proxmox VE
# Based on community-scripts/ProxmoxVE pattern
#
# Usage:
#   New Install: bash npm.sh
#   Update:      bash npm.sh update
#
# Or run directly from URL:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/garethcheyne/nginx-proxy-manager-plus/main/scripts/proxmox/npm.sh)"

source /dev/stdin <<< "$FUNCTIONS_FILE_PATH"

# Application information
APP="Nginx-Proxy-Manager"
var_tags="proxy;nginx"
var_cpu="2"
var_ram="2048"
var_disk="8"
var_os="debian"
var_version="12"
var_unprivileged="1"

# Color codes
BL="\e[36m"
GN="\e[1;32m"
RD="\e[01;31m"
YW="\e[33m"
CL="\e[m"
BOLD="\e[1m"

# Header
header_info() {
    clear
    cat <<"EOF"
    _   __      _               ____                         __  ___
   / | / /___ _(_)___  _  __   / __ \_________  _  ____  __  /  |/  /___ _____  ____ _____ ____  _____
  /  |/ / __ `/ / __ \| |/_/  / /_/ / ___/ __ \| |/_/ / / / / /|_/ / __ `/ __ \/ __ `/ __ `/ _ \/ ___/
 / /|  / /_/ / / / / />  <   / ____/ /  / /_/ />  </ /_/ / / /  / / /_/ / / / / /_/ / /_/ /  __/ /
/_/ |_/\__, /_/_/ /_/_/|_|  /_/   /_/   \____/_/|_|\__, / /_/  /_/\__,_/_/ /_/\__,_/\__, /\___/_/
      /____/                                      /____/                           /____/
EOF
}

# Function to update existing installation
update_script() {
    header_info
    check_container_storage
    check_container_resources

    if [[ ! -d /opt/npm ]]; then
        msg_error "No ${APP} Installation Found!"
        exit
    fi

    RELEASE=$(curl -fsSL https://api.github.com/repos/NginxProxyManager/nginx-proxy-manager/releases/latest | grep "tag_name" | awk '{print substr($2, 3, length($2)-4) }')
    if [[ -z "$RELEASE" ]]; then
        msg_error "Failed to get release version"
        exit
    fi

    if [[ ! -f /opt/${APP}_version.txt ]] || [[ "${RELEASE}" != "$(cat /opt/${APP}_version.txt)" ]]; then
        msg_info "Updating ${APP} to v${RELEASE}"

        # Check Debian version
        DEBIAN_VERSION=$(cat /etc/debian_version)
        if [[ "${DEBIAN_VERSION}" != "12."* ]]; then
            msg_error "Debian 12 is required. Current version: ${DEBIAN_VERSION}"
            exit
        fi

        # Check Node.js version
        CURRENT_NODE_VERSION=$(node --version 2>/dev/null | cut -d. -f1 | sed 's/v//')
        if [[ "${CURRENT_NODE_VERSION}" -lt 22 ]]; then
            msg_info "Upgrading Node.js to v22..."
            apt-get purge -y nodejs
            rm -rf /etc/apt/sources.list.d/nodesource.list
            curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
            apt-get install -y nodejs
            npm install -g yarn
        fi

        # Download and extract
        cd /opt
        msg_info "Downloading v${RELEASE}..."
        curl -fsSL "https://github.com/NginxProxyManager/nginx-proxy-manager/archive/refs/tags/v${RELEASE}.tar.gz" -o npm.tar.gz
        tar -xzf npm.tar.gz
        rm npm.tar.gz

        # Backup existing data
        if [[ -f /opt/npm/config/production.json ]]; then
            cp /opt/npm/config/production.json /tmp/production.json.bak
        fi

        # Build frontend
        msg_info "Building frontend..."
        cd "/opt/nginx-proxy-manager-${RELEASE}/frontend"
        export NODE_OPTIONS="--openssl-legacy-provider"
        yarn install
        yarn build

        # Build backend
        msg_info "Building backend..."
        cd "/opt/nginx-proxy-manager-${RELEASE}/backend"
        yarn install --production

        # Deploy
        msg_info "Deploying..."
        systemctl stop npm 2>/dev/null || true

        rm -rf /opt/npm
        mkdir -p /opt/npm
        cp -r "/opt/nginx-proxy-manager-${RELEASE}/backend/"* /opt/npm/
        cp -r "/opt/nginx-proxy-manager-${RELEASE}/frontend/dist" /opt/npm/frontend

        # Restore config
        if [[ -f /tmp/production.json.bak ]]; then
            cp /tmp/production.json.bak /opt/npm/config/production.json
            rm /tmp/production.json.bak
        fi

        # Cleanup
        rm -rf "/opt/nginx-proxy-manager-${RELEASE}"

        # Restart services
        systemctl start npm

        echo "${RELEASE}" > /opt/${APP}_version.txt
        msg_ok "Updated ${APP} to v${RELEASE}"
    else
        msg_ok "No update required. ${APP} is already at v${RELEASE}"
    fi
    exit
}

# Start installation
start() {
    if command -v pveversion >/dev/null 2>&1; then
        if ! (whiptail --backtitle "Proxmox VE Helper Scripts" --title "${APP}" --yesno "This will create a New ${APP} LXC. Proceed?" 10 58); then
            clear
            exit
        fi
        NEXTID=$(pvesh get /cluster/nextid)
        header_info
        install_script
    else
        if ! (whiptail --backtitle "Proxmox VE Helper Scripts" --title "${APP}" --yesno "This will update ${APP}. Proceed?" 10 58); then
            clear
            exit
        fi
        header_info
        update_script
    fi
}

# Description shown after installation
description() {
    IP=$(hostname -I | awk '{print $1}')
    echo -e "${BL}${BOLD}Nginx Proxy Manager${CL} installed successfully!"
    echo -e ""
    echo -e "Access the admin panel at:"
    echo -e "  ${YW}http://${IP}:81${CL}"
    echo -e ""
    echo -e "${BOLD}Default credentials:${CL}"
    echo -e "  Email:    ${YW}admin@example.com${CL}"
    echo -e "  Password: ${YW}changeme${CL}"
    echo -e ""
    echo -e "${RD}Change these credentials immediately!${CL}"
}

start
build_container
description
