# Analytics Feature for Nginx Proxy Manager

## Overview

This analytics system tracks visitor data for all proxied sites, providing insights into who visits what sites, when, and from where. The system automatically parses Nginx access logs and stores analytics data in the database for easy querying and visualization.

## Features

- **Real-time visitor tracking** - Automatically captures all proxy host traffic
- **Detailed metrics** - IP addresses, user agents, referrers, request methods, response codes
- **Performance data** - Response times and bytes transferred
- **Aggregated statistics** - Top pages, referrers, user agents, status codes
- **Time-based filtering** - Query analytics by date range
- **Per-host analytics** - View analytics for specific proxy hosts
- **REST API** - Full API access to analytics data

## Architecture

### Database Schema

The `analytics` table stores individual visitor records:

```sql
CREATE TABLE analytics (
  id INTEGER PRIMARY KEY,
  created_on DATETIME NOT NULL,
  proxy_host_id INTEGER,
  redirection_host_id INTEGER,
  dead_host_id INTEGER,
  host_type VARCHAR(50),  -- 'proxy', 'redirection', or 'dead'
  domain_name VARCHAR(255),
  client_ip VARCHAR(100),
  user_agent TEXT,
  referer VARCHAR(1000),
  request_method VARCHAR(10),
  request_uri VARCHAR(2000),
  status_code INTEGER,
  response_time INTEGER,  -- milliseconds
  bytes_sent BIGINT,
  country_code VARCHAR(2),
  meta JSON
);
```

### Components

1. **Migration** (`backend/migrations/20251120000000_analytics.js`)
   - Creates the analytics table with proper indexes

2. **Model** (`backend/models/analytics.js`)
   - Objection.js model with relationships to proxy/redirection/dead hosts

3. **Internal Service** (`backend/internal/analytics.js`)
   - Record analytics entries
   - Query analytics with filters
   - Get aggregated statistics
   - Cleanup old data

4. **Log Processor** (`backend/lib/log-processor.js`)
   - Watches Nginx access log files in real-time
   - Parses log entries using regex
   - Automatically records analytics to database

5. **API Routes** (`backend/routes/analytics.js`)
   - GET `/api/analytics` - List analytics entries
   - GET `/api/analytics/count` - Get total count
   - GET `/api/analytics/stats` - Get aggregated statistics
   - GET `/api/analytics/:hostType/:hostId` - Get analytics for specific host
   - POST `/api/analytics/record` - Manually record analytics

6. **Frontend Components**
   - Analytics dashboard page (`frontend/src/pages/Analytics/index.tsx`)
   - API client (`frontend/src/api/backend/analytics.ts`)
   - Menu integration

## Usage

### Starting the Log Processor

The log processor needs to be started when the application starts. Add this to `backend/index.js`:

```javascript
import logProcessor from "./lib/log-processor.js";

// Start watching log files for analytics
const logWatchers = logProcessor.startLogWatchers();

// Handle graceful shutdown
process.on("SIGTERM", () => {
  logProcessor.stopLogWatchers(logWatchers);
  process.exit(0);
});
```

### API Examples

**Get analytics for the last 7 days:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:81/api/analytics?date_from=2024-11-13&date_to=2024-11-20&limit=100"
```

**Get aggregated statistics:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:81/api/analytics/stats?date_from=2024-11-13"
```

**Get analytics for a specific proxy host:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:81/api/analytics/proxy/5"
```

### Frontend Usage

Access the analytics dashboard by navigating to `/analytics` in the web interface. The dashboard displays:

- Total visits and unique visitors
- Success rate (2xx/3xx status codes)
- Top pages and referrers
- Status code distribution
- Top countries and user agents
- Traffic trends

## Configuration

### Nginx Log Format

A custom log format `analytics` has been added to capture all necessary data:

```nginx
log_format analytics '$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent" "$host" $request_time';
```

Proxy host templates use this format:
```nginx
access_log /data/logs/proxy-host-{{ id }}_access.log analytics;
```

### Data Retention

To prevent the database from growing indefinitely, implement a cleanup cron job:

```javascript
import internalAnalytics from "./internal/analytics.js";

// Delete analytics older than 90 days
setInterval(() => {
  internalAnalytics.cleanup(90);
}, 86400000); // Run daily
```

## Permissions

Analytics are accessible to all authenticated users. To restrict access, update the access control in `backend/lib/access.js` to add an `analytics:list` permission.

## Future Enhancements

Potential improvements:

1. **GeoIP Integration** - Add MaxMind GeoIP2 or similar for accurate country detection
2. **Charts and Graphs** - Add Chart.js or similar for visual analytics
3. **Real-time Dashboard** - WebSocket updates for live traffic monitoring
4. **Alerts** - Notify on traffic anomalies or specific patterns
5. **Export** - CSV/PDF export of analytics data
6. **Privacy Options** - IP anonymization, GDPR compliance features
7. **Bot Detection** - Filter out known bots and crawlers
8. **Session Tracking** - Track user sessions across requests
9. **Conversion Tracking** - Track specific goals or conversions
10. **A/B Testing** - Built-in A/B testing capabilities

## Performance Considerations

- **Indexes** are created on frequently queried columns (proxy_host_id, created_on, client_ip, domain_name)
- **Log watching** uses the `tail` library for efficient file tailing
- **Batch inserts** could be implemented for high-traffic sites
- **Archiving** old data to separate tables/databases for large datasets
- **Caching** frequently accessed statistics using Redis

## Dependencies

New dependencies added:
- `tail` (^2.2.6) - For watching log files in real-time

## Installation Steps

1. **Run migrations:**
   ```bash
   cd backend
   npm install
   npm run migrate
   ```

2. **Install frontend dependencies:**
   ```bash
   cd frontend
   npm install
   ```

3. **Start the application:**
   The log processor will automatically start watching log files.

4. **Access the dashboard:**
   Navigate to `/analytics` in the web interface.

## Troubleshooting

**No analytics data appearing:**
- Check that Nginx is generating logs in `/data/logs/`
- Verify the log processor is running
- Check for errors in the application logs
- Ensure the analytics table was created (run migrations)

**Performance issues:**
- Implement data retention policies
- Add additional indexes if querying specific fields
- Consider archiving old data
- Use pagination when fetching large result sets

**Log parsing errors:**
- Verify the Nginx log format matches the regex in log-processor.js
- Check that the log format is set to `analytics` in proxy host templates

## License

This analytics feature is part of the Nginx Proxy Manager project and follows the same MIT license.
