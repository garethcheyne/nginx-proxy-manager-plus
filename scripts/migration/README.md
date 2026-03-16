# NPM Migration Tool

Migrate your existing Nginx Proxy Manager installation to NPM Plus.

## Quick Start

### Step 1: Export from Original NPM

Run this command on your **original** NPM server:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/garethcheyne/nginx-proxy-manager-plus/main/scripts/migration/export-npm.sh)"
```

This will create a ZIP file containing:
- All proxy hosts, redirections, 404 hosts, and streams
- SSL certificates (Let's Encrypt and custom)
- Access lists and authentication
- User accounts
- Nginx configurations

### Step 2: Download the Export

The script will show you the export file location. Download it to your local machine:

```bash
scp root@<original-npm-ip>:/tmp/npm-export-*.zip ./
```

### Step 3: Import to NPM Plus

1. Log in to your NPM Plus admin panel
2. Go to **Settings** > **Migration**
3. Click **Upload Export File**
4. Select the ZIP file
5. Review the preview of items to import
6. Configure import options:
   - **Import Users**: Include user accounts
   - **Import Hosts**: Include all host types
   - **Import Certificates**: Include SSL certificates
   - **Import Access Lists**: Include access restrictions
   - **Overwrite Existing**: Replace existing records with same ID
7. Click **Import**

## Manual Export

If the automatic script doesn't work, you can manually export:

### For SQLite Database

```bash
# Copy database
cp /data/database.sqlite /tmp/npm-export/

# Export to JSON (optional)
sqlite3 /data/database.sqlite ".mode json" ".output /tmp/npm-export/proxy_hosts.json" "SELECT * FROM proxy_host WHERE is_deleted = 0;"
```

### For MySQL/MariaDB Database

```bash
# Export using mysqldump
mysqldump -u npm_user -p npm_database proxy_host redirection_host dead_host stream certificate > /tmp/npm-export/database.sql
```

### Copy Certificates

```bash
# Copy nginx configs
cp -r /data/nginx /tmp/npm-export/

# Copy custom SSL
cp -r /data/custom_ssl /tmp/npm-export/certificates/

# Copy Let's Encrypt
cp -rL /etc/letsencrypt/live /tmp/npm-export/certificates/letsencrypt/
cp -r /etc/letsencrypt/archive /tmp/npm-export/certificates/letsencrypt/
cp -r /etc/letsencrypt/renewal /tmp/npm-export/certificates/letsencrypt/
```

### Create ZIP

```bash
cd /tmp/npm-export && zip -r npm-export.zip .
```

## API Endpoints

### Validate Export

```bash
curl -X POST http://npm-plus:81/api/migration/validate \
  -H "Authorization: Bearer <token>" \
  -F "file=@npm-export.zip"
```

**Response:**
```json
{
  "valid": true,
  "metadata": {
    "exportDate": "2024-01-15T10:30:00Z",
    "sourceVersion": "2.11.1"
  },
  "preview": {
    "proxyHosts": 15,
    "redirectionHosts": 3,
    "deadHosts": 1,
    "streams": 2,
    "certificates": 5,
    "users": 2
  }
}
```

### Import Export

```bash
curl -X POST http://npm-plus:81/api/migration/import \
  -H "Authorization: Bearer <token>" \
  -F "file=@npm-export.zip" \
  -F "importUsers=true" \
  -F "importHosts=true" \
  -F "importCertificates=true" \
  -F "importAccessLists=true" \
  -F "overwriteExisting=false"
```

**Response:**
```json
{
  "message": "Migration import completed successfully",
  "imported": {
    "proxyHosts": 15,
    "redirectionHosts": 3,
    "deadHosts": 1,
    "streams": 2,
    "certificates": 5,
    "users": 2,
    "nginxConfigs": 21,
    "sslFiles": 12
  }
}
```

## Troubleshooting

### Export Script Fails

1. **Permission denied**: Run with `sudo`
2. **sqlite3 not found**: Install with `apt install sqlite3`
3. **Database not found**: Set `NPM_DATA_DIR` environment variable

```bash
NPM_DATA_DIR=/path/to/data bash export-npm.sh
```

### Import Fails

1. **Invalid ZIP file**: Re-download and try again
2. **Database errors**: Check NPM Plus logs with `docker logs npm-plus`
3. **Certificate errors**: Ensure certificates are valid and not expired

### Missing Hosts After Import

1. Check if hosts were marked as deleted in the source
2. Verify database.json contains the expected records
3. Try with `overwriteExisting=true` option

## Export File Structure

```
npm-export.zip
├── metadata.json           # Export info and version
├── database.json           # Database tables as JSON
├── database.sqlite         # Raw SQLite backup (if available)
├── nginx/
│   ├── proxy_host/         # Proxy host configs
│   ├── redirection_host/   # Redirection configs
│   ├── dead_host/          # 404 host configs
│   └── stream/             # Stream configs
├── certificates/
│   ├── custom_ssl/         # Custom SSL certificates
│   └── letsencrypt/        # Let's Encrypt certificates
│       ├── live/
│       ├── archive/
│       └── renewal/
├── access/                 # Access list files
└── keys.json               # Encryption keys
```
