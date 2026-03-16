<p align="center">
	<img src="https://nginxproxymanager.com/github.png">
	<br><br>
	<img src="https://img.shields.io/badge/version-3.0.0-blue.svg?style=for-the-badge">
	<a href="https://github.com/garethcheyne/nginx-proxy-manager-plus">
		<img src="https://img.shields.io/github/stars/garethcheyne/nginx-proxy-manager-plus?style=for-the-badge">
	</a>
	<a href="https://github.com/garethcheyne/nginx-proxy-manager-plus/fork">
		<img src="https://img.shields.io/github/forks/garethcheyne/nginx-proxy-manager-plus?style=for-the-badge">
	</a>
</p>

# Nginx Proxy Manager Plus

> **Enhanced fork of [Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager) by [Jamie Curnow (jc21)](https://github.com/jc21)**

This project extends the original Nginx Proxy Manager with additional features including analytics, backup/restore functionality, error logging, and Proxmox LXC deployment scripts.

---

## Credits

This project is based on the excellent work of **Jamie Curnow** and the [Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager) community. We are grateful for their contributions to the open-source community.

- **Original Project:** [NginxProxyManager/nginx-proxy-manager](https://github.com/NginxProxyManager/nginx-proxy-manager)
- **Original Author:** [Jamie Curnow (jc21)](https://github.com/jc21)
- **License:** MIT

<a href="https://www.buymeacoffee.com/jc21" target="_blank"><img src="http://public.jc21.com/github/by-me-a-coffee.png" alt="Buy Me A Coffee - Support the Original Creator" style="height: 51px !important;width: 217px !important;" ></a>

---

## New Features in Plus Edition

- **Analytics Dashboard** - Track proxy usage, bandwidth, and request statistics
- **Backup & Restore** - Full configuration backup and restore capabilities
- **Error Logging** - Enhanced error tracking and log viewer
- **Proxmox LXC Scripts** - One-command deployment to Proxmox VE containers

## Original Features

- Beautiful and Secure Admin Interface based on [Tabler](https://tabler.github.io/)
- Easily create forwarding domains, redirections, streams and 404 hosts without knowing anything about Nginx
- Free SSL using Let's Encrypt or provide your own custom SSL certificates
- Access Lists and basic HTTP Authentication for your hosts
- Advanced Nginx configuration available for super users
- User management, permissions and audit log

---

## Quick Setup

### Docker (Recommended)

1. [Install Docker](https://docs.docker.com/install/)
2. Create a docker-compose.yml file:

```yml
services:
  app:
    image: 'ghcr.io/garethcheyne/nginx-proxy-manager-plus:latest'
    restart: unless-stopped
    ports:
      - '80:80'
      - '81:81'
      - '443:443'
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

3. Bring up your stack:

```bash
docker compose up -d
```

4. Access the Admin UI at [http://127.0.0.1:81](http://127.0.0.1:81)

**Default Credentials:**
- Email: `admin@example.com`
- Password: `changeme`

*Change these immediately after first login!*

### Proxmox LXC Container

Deploy directly to Proxmox VE with a single command:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/garethcheyne/nginx-proxy-manager-plus/main/scripts/proxmox/create-npm-lxc.sh)"
```

See [Proxmox Installation Guide](scripts/proxmox/README.md) for more details.

---

## Hosting your home network

1. Your home router will have a Port Forwarding section somewhere. Log in and find it
2. Add port forwarding for port 80 and 443 to the server hosting this project
3. Configure your domain name details to point to your home, either with a static ip or a service like:
   - DuckDNS
   - [Amazon Route53](https://github.com/jc21/route53-ddns)
   - [Cloudflare](https://github.com/jc21/cloudflare-ddns)
4. Use the Nginx Proxy Manager as your gateway to forward to your other web based services

---

## Contributing

All are welcome to create pull requests for this project, against the `develop` branch.

### Contributors

Special thanks to:
- [Jamie Curnow (jc21)](https://github.com/jc21) - Original creator
- [All original contributors](https://github.com/NginxProxyManager/nginx-proxy-manager/graphs/contributors)
- [Plus edition contributors](https://github.com/garethcheyne/nginx-proxy-manager-plus/graphs/contributors)

---

## Getting Support

1. [Found a bug?](https://github.com/garethcheyne/nginx-proxy-manager-plus/issues)
2. [Discussions](https://github.com/garethcheyne/nginx-proxy-manager-plus/discussions)
3. [Original Project](https://github.com/NginxProxyManager/nginx-proxy-manager)
4. [Reddit](https://reddit.com/r/nginxproxymanager)

---

## License

MIT License - See [LICENSE](LICENSE) for details.

This project is a fork of [Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager) which is also MIT licensed.
