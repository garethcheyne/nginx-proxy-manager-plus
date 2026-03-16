#!/usr/bin/env bash

# Nginx Proxy Manager - Export Tool
# Extracts all sites and configuration from an existing NPM installation
# for migration to Nginx Proxy Manager Plus
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/garethcheyne/nginx-proxy-manager-plus/main/scripts/migration/export-npm.sh | bash
#
# Or download and run:
#   curl -fsSL https://raw.githubusercontent.com/garethcheyne/nginx-proxy-manager-plus/main/scripts/migration/export-npm.sh -o export-npm.sh
#   chmod +x export-npm.sh
#   ./export-npm.sh

set -euo pipefail

# Colors
RD='\033[01;31m'
GN='\033[1;32m'
YW='\033[33m'
BL='\033[36m'
CL='\033[m'
BOLD='\033[1m'

# Default paths (can be overridden by environment variables)
NPM_DATA_DIR="${NPM_DATA_DIR:-/data}"
NPM_LETSENCRYPT_DIR="${NPM_LETSENCRYPT_DIR:-/etc/letsencrypt}"
OUTPUT_DIR="${OUTPUT_DIR:-/tmp}"

# Logging
msg_info() { echo -e "${BL}[INFO]${CL} $1"; }
msg_ok() { echo -e "${GN}[OK]${CL} $1"; }
msg_error() { echo -e "${RD}[ERROR]${CL} $1"; exit 1; }
msg_warn() { echo -e "${YW}[WARN]${CL} $1"; }

header() {
    clear
    cat <<"EOF"
    _   ____  __  ___   ______                      __
   / | / / / / |/  /  / ____/  ______  ____  _____/ /_
  /  |/ / /_/ / /|_/ /  / __/ / / / _ \/ __ \/ ___/ __/
 / /|  / ____/ /  / /  / /___ >  < (__/  __/ /  / /_
/_/ |_/_/   /_/  /_/   \____/_/|_|\___/\__/_/   \__/

         Migration Export Tool for NPM Plus
EOF
    echo -e "\n${BL}${BOLD}Export your NPM configuration for migration${CL}\n"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        msg_error "This script must be run as root (try: sudo bash export-npm.sh)"
    fi
}

check_dependencies() {
    msg_info "Checking dependencies..."

    local missing=()

    if ! command -v sqlite3 &> /dev/null; then
        missing+=("sqlite3")
    fi

    if ! command -v zip &> /dev/null; then
        missing+=("zip")
    fi

    if ! command -v jq &> /dev/null; then
        missing+=("jq")
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        msg_warn "Missing dependencies: ${missing[*]}"
        msg_info "Attempting to install..."

        if command -v apt-get &> /dev/null; then
            apt-get update && apt-get install -y "${missing[@]}"
        elif command -v apk &> /dev/null; then
            apk add --no-cache "${missing[@]}"
        elif command -v yum &> /dev/null; then
            yum install -y "${missing[@]}"
        else
            msg_error "Could not install dependencies. Please install manually: ${missing[*]}"
        fi
    fi

    msg_ok "Dependencies satisfied"
}

detect_npm_installation() {
    msg_info "Detecting NPM installation..."

    # Check for database
    if [[ -f "${NPM_DATA_DIR}/database.sqlite" ]]; then
        DB_TYPE="sqlite"
        DB_PATH="${NPM_DATA_DIR}/database.sqlite"
        msg_ok "Found SQLite database at ${DB_PATH}"
    elif [[ -f "${NPM_DATA_DIR}/config.json" ]]; then
        # Check for MySQL/MariaDB config
        if command -v jq &> /dev/null && jq -e '.database.host' "${NPM_DATA_DIR}/config.json" &> /dev/null; then
            DB_TYPE="mysql"
            msg_warn "MySQL database detected - export will only include file configurations"
            msg_warn "You'll need to manually export database tables"
        fi
    else
        msg_error "Could not find NPM database. Make sure NPM_DATA_DIR (${NPM_DATA_DIR}) is correct."
    fi

    # Check for nginx configs
    if [[ -d "${NPM_DATA_DIR}/nginx" ]]; then
        msg_ok "Found nginx configurations at ${NPM_DATA_DIR}/nginx"
    else
        msg_warn "Nginx config directory not found at ${NPM_DATA_DIR}/nginx"
    fi

    # Check for SSL certificates
    if [[ -d "${NPM_LETSENCRYPT_DIR}/live" ]]; then
        msg_ok "Found Let's Encrypt certificates at ${NPM_LETSENCRYPT_DIR}"
    else
        msg_warn "Let's Encrypt directory not found at ${NPM_LETSENCRYPT_DIR}"
    fi
}

export_database() {
    msg_info "Exporting database..."

    if [[ "$DB_TYPE" == "sqlite" ]]; then
        # Export each table to JSON
        local tables=(
            "user"
            "auth"
            "user_permission"
            "proxy_host"
            "redirection_host"
            "dead_host"
            "stream"
            "certificate"
            "access_list"
            "access_list_client"
            "access_list_auth"
            "setting"
        )

        echo "{" > "${EXPORT_DIR}/database.json"
        local first=true

        for table in "${tables[@]}"; do
            if sqlite3 "$DB_PATH" ".tables" | grep -qw "$table"; then
                if [[ "$first" == true ]]; then
                    first=false
                else
                    echo "," >> "${EXPORT_DIR}/database.json"
                fi

                echo "\"${table}\": " >> "${EXPORT_DIR}/database.json"

                # Export table to JSON array
                sqlite3 -json "$DB_PATH" "SELECT * FROM ${table};" >> "${EXPORT_DIR}/database.json" 2>/dev/null || echo "[]" >> "${EXPORT_DIR}/database.json"

                local count
                count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM ${table};" 2>/dev/null || echo "0")
                msg_info "  Exported ${table}: ${count} rows"
            fi
        done

        echo "}" >> "${EXPORT_DIR}/database.json"

        # Also copy raw SQLite file as backup
        cp "$DB_PATH" "${EXPORT_DIR}/database.sqlite"

        msg_ok "Database exported"
    else
        msg_warn "Skipping database export (MySQL/MariaDB not supported for automatic export)"
        echo '{"warning": "Database was not exported - MySQL/MariaDB requires manual export"}' > "${EXPORT_DIR}/database.json"
    fi
}

export_nginx_configs() {
    msg_info "Exporting nginx configurations..."

    if [[ -d "${NPM_DATA_DIR}/nginx" ]]; then
        cp -r "${NPM_DATA_DIR}/nginx" "${EXPORT_DIR}/nginx"

        local proxy_count=0
        local redirect_count=0
        local dead_count=0
        local stream_count=0

        [[ -d "${NPM_DATA_DIR}/nginx/proxy_host" ]] && proxy_count=$(find "${NPM_DATA_DIR}/nginx/proxy_host" -name "*.conf" 2>/dev/null | wc -l)
        [[ -d "${NPM_DATA_DIR}/nginx/redirection_host" ]] && redirect_count=$(find "${NPM_DATA_DIR}/nginx/redirection_host" -name "*.conf" 2>/dev/null | wc -l)
        [[ -d "${NPM_DATA_DIR}/nginx/dead_host" ]] && dead_count=$(find "${NPM_DATA_DIR}/nginx/dead_host" -name "*.conf" 2>/dev/null | wc -l)
        [[ -d "${NPM_DATA_DIR}/nginx/stream" ]] && stream_count=$(find "${NPM_DATA_DIR}/nginx/stream" -name "*.conf" 2>/dev/null | wc -l)

        msg_info "  Proxy hosts: ${proxy_count}"
        msg_info "  Redirections: ${redirect_count}"
        msg_info "  404 hosts: ${dead_count}"
        msg_info "  Streams: ${stream_count}"

        msg_ok "Nginx configurations exported"
    else
        mkdir -p "${EXPORT_DIR}/nginx"
        msg_warn "No nginx configurations found"
    fi
}

export_ssl_certificates() {
    msg_info "Exporting SSL certificates..."

    mkdir -p "${EXPORT_DIR}/certificates"

    # Custom SSL certificates
    if [[ -d "${NPM_DATA_DIR}/custom_ssl" ]]; then
        cp -r "${NPM_DATA_DIR}/custom_ssl" "${EXPORT_DIR}/certificates/custom_ssl"
        local custom_count
        custom_count=$(find "${NPM_DATA_DIR}/custom_ssl" -type f 2>/dev/null | wc -l)
        msg_info "  Custom SSL files: ${custom_count}"
    fi

    # Let's Encrypt certificates
    if [[ -d "${NPM_LETSENCRYPT_DIR}/live" ]]; then
        mkdir -p "${EXPORT_DIR}/certificates/letsencrypt"
        cp -rL "${NPM_LETSENCRYPT_DIR}/live" "${EXPORT_DIR}/certificates/letsencrypt/" 2>/dev/null || true
        cp -r "${NPM_LETSENCRYPT_DIR}/archive" "${EXPORT_DIR}/certificates/letsencrypt/" 2>/dev/null || true
        cp -r "${NPM_LETSENCRYPT_DIR}/renewal" "${EXPORT_DIR}/certificates/letsencrypt/" 2>/dev/null || true

        local le_count
        le_count=$(find "${NPM_LETSENCRYPT_DIR}/live" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
        msg_info "  Let's Encrypt certificates: ${le_count}"
    else
        msg_warn "No Let's Encrypt certificates found"
    fi

    # DNS credentials
    if [[ -d "${NPM_LETSENCRYPT_DIR}/credentials" ]]; then
        cp -r "${NPM_LETSENCRYPT_DIR}/credentials" "${EXPORT_DIR}/certificates/credentials"
    fi

    msg_ok "SSL certificates exported"
}

export_access_lists() {
    msg_info "Exporting access lists..."

    if [[ -d "${NPM_DATA_DIR}/access" ]]; then
        cp -r "${NPM_DATA_DIR}/access" "${EXPORT_DIR}/access"
        local count
        count=$(find "${NPM_DATA_DIR}/access" -type f 2>/dev/null | wc -l)
        msg_info "  Access list files: ${count}"
        msg_ok "Access lists exported"
    else
        mkdir -p "${EXPORT_DIR}/access"
        msg_warn "No access lists found"
    fi
}

export_keys() {
    msg_info "Exporting encryption keys..."

    if [[ -f "${NPM_DATA_DIR}/keys.json" ]]; then
        cp "${NPM_DATA_DIR}/keys.json" "${EXPORT_DIR}/keys.json"
        msg_ok "Encryption keys exported"
    else
        msg_warn "No keys.json found"
    fi
}

create_metadata() {
    msg_info "Creating metadata..."

    local npm_version="unknown"

    # Try to get NPM version
    if [[ -f "/opt/npm/package.json" ]]; then
        npm_version=$(jq -r '.version // "unknown"' /opt/npm/package.json 2>/dev/null || echo "unknown")
    elif [[ -f "/app/package.json" ]]; then
        npm_version=$(jq -r '.version // "unknown"' /app/package.json 2>/dev/null || echo "unknown")
    fi

    cat > "${EXPORT_DIR}/metadata.json" << EOF
{
    "exportVersion": "1.0.0",
    "exportDate": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "sourceVersion": "${npm_version}",
    "hostname": "$(hostname)",
    "exportType": "migration",
    "databaseType": "${DB_TYPE:-unknown}",
    "compatibility": "nginx-proxy-manager-plus"
}
EOF

    msg_ok "Metadata created"
}

create_zip() {
    msg_info "Creating export archive..."

    local timestamp
    timestamp=$(date +%Y%m%d_%H%M%S)
    EXPORT_FILE="${OUTPUT_DIR}/npm-export-${timestamp}.zip"

    cd "${EXPORT_DIR}"
    zip -r "${EXPORT_FILE}" . -x "*.tmp"

    local size
    size=$(du -h "${EXPORT_FILE}" | cut -f1)

    msg_ok "Export archive created: ${EXPORT_FILE} (${size})"
}

cleanup() {
    msg_info "Cleaning up temporary files..."
    rm -rf "${EXPORT_DIR}"
    msg_ok "Cleanup complete"
}

show_completion() {
    echo
    echo -e "${GN}${BOLD}╔════════════════════════════════════════════════════════════╗${CL}"
    echo -e "${GN}${BOLD}║              Export Complete!                              ║${CL}"
    echo -e "${GN}${BOLD}╚════════════════════════════════════════════════════════════╝${CL}"
    echo
    echo -e "Your export file is ready at:"
    echo -e "  ${YW}${EXPORT_FILE}${CL}"
    echo
    echo -e "${BOLD}Next Steps:${CL}"
    echo -e "  1. Download the export file to your local machine"
    echo -e "  2. Go to your NPM Plus admin panel"
    echo -e "  3. Navigate to Settings > Migration"
    echo -e "  4. Upload the export ZIP file"
    echo -e "  5. Review and confirm the import"
    echo
    echo -e "${BOLD}Download command (run on your local machine):${CL}"
    echo -e "  ${BL}scp root@$(hostname -I | awk '{print $1}'):${EXPORT_FILE} ./${CL}"
    echo
}

# Main execution
main() {
    header
    check_root
    check_dependencies
    detect_npm_installation

    # Create temporary export directory
    EXPORT_DIR=$(mktemp -d -t npm-export-XXXXXX)
    trap cleanup EXIT

    export_database
    export_nginx_configs
    export_ssl_certificates
    export_access_lists
    export_keys
    create_metadata
    create_zip

    # Remove trap to keep the zip file
    trap - EXIT
    rm -rf "${EXPORT_DIR}"

    show_completion
}

main "$@"
