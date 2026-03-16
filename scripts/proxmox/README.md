# Proxmox LXC Installation Scripts

These scripts automate the deployment of Nginx Proxy Manager in a Proxmox VE LXC container.

## Quick Start

Run directly on your Proxmox host:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/garethcheyne/nginx-proxy-manager-plus/main/scripts/proxmox/create-npm-lxc.sh)"
```

Or download and run:

```bash
curl -fsSL https://raw.githubusercontent.com/garethcheyne/nginx-proxy-manager-plus/main/scripts/proxmox/create-npm-lxc.sh -o create-npm-lxc.sh
chmod +x create-npm-lxc.sh
./create-npm-lxc.sh
```

## Scripts

| Script | Description |
|--------|-------------|
| `create-npm-lxc.sh` | **Standalone** - All-in-one script to create and configure an LXC container with NPM |
| `npm-install.sh` | Installation script that runs inside an existing container |
| `npm.sh` | Community-scripts compatible wrapper (requires build.func) |
| `create-lxc.sh` | Legacy container creation script |

## Requirements

- Proxmox VE 7.x or 8.x
- Root access on the Proxmox host
- Available storage for containers
- Network connectivity for package downloads

## Default Container Configuration

| Setting | Default |
|---------|---------|
| OS | Debian 12 |
| Disk | 8 GB |
| RAM | 2048 MB |
| CPU Cores | 2 |
| Network | DHCP |

All settings can be customized during the interactive setup.

## After Installation

Access the admin panel at: `http://<container-ip>:81`

**Default credentials:**
- Email: `admin@example.com`
- Password: `changeme`

**Change these immediately!**

## Container Management

```bash
# Enter container shell
pct enter <CTID>

# Stop/start container
pct stop <CTID>
pct start <CTID>

# Inside container - check services
systemctl status npm
systemctl status openresty

# View logs
journalctl -u npm -f
```

## Ports

| Port | Service |
|------|---------|
| 80 | HTTP (proxy) |
| 81 | Admin Panel |
| 443 | HTTPS (proxy) |

## Updating

To update an existing installation, enter the container and run:

```bash
curl -fsSL https://raw.githubusercontent.com/garethcheyne/nginx-proxy-manager-plus/main/scripts/proxmox/npm-install.sh | bash
```

Or use the community-scripts compatible update:

```bash
bash npm.sh update
```
