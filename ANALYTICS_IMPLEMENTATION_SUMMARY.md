# Analytics Feature Implementation Summary

## Overview
Comprehensive visitor analytics system added to Nginx Proxy Manager to track "who visits what site" with per-site toggle control.

## Implementation Date
November 20, 2025

## Features Implemented

### 1. Database Schema
- **Analytics table** for storing visitor data
- **Analytics_enabled flag** on all host types (proxy, redirection, dead)
- Proper indexes for query performance
- Relationships to all host types

### 2. Backend Components

#### Migrations
- `20251120000000_analytics.js` - Creates analytics table
- `20251120100000_analytics_enabled.js` - Adds per-site toggle

#### Models
- `models/analytics.js` - Objection.js model with host relationships
- Updated `models/proxy_host.js` - Added analytics_enabled bool field
- Updated `models/redirection_host.js` - Added analytics_enabled bool field
- Updated `models/dead_host.js` - Added analytics_enabled bool field

#### Business Logic
- `internal/analytics.js` - Core analytics operations:
  - `record()` - Create analytics entry
  - `getAll()` - Query with filtering
  - `getCount()` - Total records count
  - `getStats()` - Aggregated statistics
  - `getByHost()` - Host-specific analytics
  - `cleanup()` - Remove old records

#### API Endpoints
- `routes/analytics.js` - REST API:
  - `GET /api/analytics` - List with filters
  - `GET /api/analytics/count` - Total count
  - `GET /api/analytics/stats` - Statistics
  - `GET /api/analytics/:hostType/:hostId` - Host-specific
  - `POST /api/analytics/record` - Manual recording

#### Log Processing
- `lib/log-processor.js` - Real-time Nginx log parser:
  - Watches `/data/logs/` directory
  - Parses analytics log format
  - Checks `analytics_enabled` flag before recording
  - Uses `tail` library for efficient file watching
  - Extracts host type and ID from filename

#### Configuration
- `docker/rootfs/etc/nginx/conf.d/include/log.conf` - Added analytics log format
- `backend/templates/proxy_host.conf` - Uses analytics log format
- `backend/package.json` - Added `tail` dependency

### 3. Frontend Components

#### API Client
- `frontend/src/api/backend/analytics.ts` - TypeScript API client
- Updated `frontend/src/api/backend/index.ts` - Export analytics API
- Updated `frontend/src/api/backend/models.ts` - Added analyticsEnabled field

#### Dashboard
- `frontend/src/pages/Analytics/index.tsx` - Analytics dashboard:
  - Total visits, unique visitors, success rate, countries
  - Top pages, referrers, status codes, user agents
  - Auto-refresh every 60 seconds
  - Uses TanStack Query for data fetching

#### Navigation
- Updated `frontend/src/Router.tsx` - Added `/analytics` route
- Updated `frontend/src/components/SiteMenu.tsx` - Added analytics menu item

#### Host Modals (Analytics Toggle)
- `frontend/src/modals/ProxyHostModal.tsx`:
  - Added checkbox after Websockets Support
  - Green color (bg-lime) when enabled
  - Defaults to enabled
  
- `frontend/src/modals/RedirectionHostModal.tsx`:
  - Added checkbox after Block Common Exploits
  - Yellow color (bg-yellow) when enabled
  - Defaults to enabled

- `frontend/src/modals/DeadHostModal.tsx`:
  - Added checkbox in SSL tab
  - Red color (bg-red) when enabled
  - Defaults to enabled

#### Translations
- `frontend/src/locale/src/en.json` - Added "host.flags.analytics-enabled": "Enable Analytics"

### 4. Documentation
- `ANALYTICS.md` - Feature documentation
- `TESTING_ANALYTICS.md` - Comprehensive testing guide
- `ANALYTICS_IMPLEMENTATION_SUMMARY.md` - This file

## Files Created (New)
```
backend/migrations/20251120000000_analytics.js
backend/migrations/20251120100000_analytics_enabled.js
backend/models/analytics.js
backend/internal/analytics.js
backend/routes/analytics.js
backend/lib/log-processor.js
frontend/src/api/backend/analytics.ts
frontend/src/pages/Analytics/index.tsx
ANALYTICS.md
TESTING_ANALYTICS.md
ANALYTICS_IMPLEMENTATION_SUMMARY.md
```

## Files Modified (Existing)
```
backend/routes/main.js
backend/models/proxy_host.js
backend/models/redirection_host.js
backend/models/dead_host.js
backend/templates/proxy_host.conf
backend/package.json
docker/rootfs/etc/nginx/conf.d/include/log.conf
frontend/src/api/backend/index.ts
frontend/src/api/backend/models.ts
frontend/src/Router.tsx
frontend/src/components/SiteMenu.tsx
frontend/src/modals/ProxyHostModal.tsx
frontend/src/modals/RedirectionHostModal.tsx
frontend/src/modals/DeadHostModal.tsx
frontend/src/locale/src/en.json
```

## Technical Specifications

### Analytics Data Captured
- **Host Information:** Type, ID, domain name
- **Request Details:** Method, URI, status code
- **Client Information:** IP address, user agent, referer
- **Performance:** Response time, bytes sent
- **Metadata:** Timestamps, country code (optional)

### Log Format
```nginx
log_format analytics '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent" '
                    '$request_time "$host"';
```

### Database Indexes
- `idx_analytics_proxy_host_id` - Fast host lookups
- `idx_analytics_created_on` - Time-based queries
- `idx_analytics_host_type_created` - Combined filtering
- `idx_analytics_client_ip` - IP-based analysis
- `idx_analytics_domain_name` - Domain statistics

### API Response Examples

#### GET /api/analytics/stats
```json
{
  "totalVisits": 1523,
  "uniqueVisitors": 347,
  "topPages": [
    {"requestUri": "/", "domainName": "example.com", "visits": 245},
    {"requestUri": "/about", "domainName": "example.com", "visits": 123}
  ],
  "topReferers": [
    {"referer": "https://google.com", "count": 89},
    {"referer": "https://facebook.com", "count": 45}
  ],
  "topUserAgents": [
    {"userAgent": "Mozilla/5.0 Chrome/120.0", "count": 234}
  ],
  "topCountries": [
    {"countryCode": "US", "count": 567},
    {"countryCode": "GB", "count": 234}
  ],
  "statusCodes": [
    {"statusCode": 200, "count": 1234},
    {"statusCode": 404, "count": 123}
  ],
  "trafficByHour": [
    {"hour": "2025-11-20 14:00", "visits": 45},
    {"hour": "2025-11-20 15:00", "visits": 67}
  ]
}
```

## Key Design Decisions

### 1. Per-Site Toggle Default
- **Decision:** Analytics enabled by default (`analytics_enabled = 1`)
- **Rationale:** Opt-out approach encourages adoption while respecting explicit disable

### 2. Log Processing Approach
- **Decision:** Real-time file watching vs cron-based batch processing
- **Chosen:** Real-time with `tail` library
- **Rationale:** Immediate data availability, better user experience

### 3. Data Retention
- **Decision:** 90-day default retention
- **Rationale:** Balance between historical analysis and database size

### 4. Host Type Discrimination
- **Decision:** Single analytics table with `host_type` field vs separate tables
- **Chosen:** Single table with nullable foreign keys
- **Rationale:** Simpler queries, easier aggregation, consistent API

### 5. Frontend State Management
- **Decision:** TanStack Query vs Redux
- **Chosen:** TanStack Query
- **Rationale:** Already used in project, perfect for server state

## Performance Considerations

### Optimizations Implemented
1. **Database indexes** on frequently queried columns
2. **Log file watching** instead of polling
3. **Lazy loading** analytics dashboard
4. **Auto-refresh** with 60s interval (not too aggressive)
5. **Query limits** on top N results (10-20 items)

### Potential Bottlenecks
1. **High traffic sites** - Consider async queue for log processing
2. **Large datasets** - May need pagination on dashboard
3. **Multiple hosts** - Log processor spawns one watcher per file

### Scaling Recommendations
- **Short term (< 100 hosts):** Current implementation sufficient
- **Medium term (100-1000 hosts):** Add Redis queue for log processing
- **Long term (> 1000 hosts):** Consider dedicated analytics service (e.g., ClickHouse)

## Security Considerations

### Data Privacy
- ⚠️ **IP addresses stored** - Consider anonymization (last octet masking)
- ⚠️ **User agents logged** - Potential device fingerprinting
- ⚠️ **Referers captured** - May contain sensitive query parameters

### GDPR Compliance
- ✅ **User consent** - Via per-site toggle
- ⚠️ **Data retention** - Cleanup function available
- ❌ **Right to deletion** - Not yet implemented (future enhancement)
- ❌ **Data export** - Not yet implemented (future enhancement)

### Access Control
- ✅ **API authentication** - Requires valid JWT token
- ✅ **Authorization** - Admin users only
- ✅ **Input validation** - Using validator middleware

## Testing Status

### Unit Tests
- ❌ Not implemented (recommended for future)

### Integration Tests
- ❌ Not implemented (recommended for future)

### E2E Tests
- ❌ Not implemented (recommended for future)

### Manual Testing
- ✅ Comprehensive test plan created (TESTING_ANALYTICS.md)
- ⏳ Pending execution

## Known Issues / Limitations

### Current Limitations
1. **No country code detection** - GeoIP integration needed
2. **No bot filtering** - All traffic tracked including bots
3. **No real-time dashboard** - 60s refresh interval only
4. **No data export** - Cannot download analytics as CSV/PDF
5. **No custom date ranges** - Fixed periods only

### Future Enhancements
1. **GeoIP Integration** - Populate country_code field
2. **Bot Detection** - Filter crawlers/bots from analytics
3. **WebSocket Updates** - Real-time dashboard updates
4. **Export Functionality** - CSV, PDF, Excel downloads
5. **Custom Dashboards** - User-configurable widgets
6. **Alerts** - Traffic spike notifications
7. **Comparisons** - Period-over-period analysis
8. **Conversion Tracking** - Goal/funnel analytics

## Deployment Checklist

### Before Deploying
- [ ] Run database migrations
- [ ] Install backend dependencies (`npm install` for `tail`)
- [ ] Install frontend dependencies
- [ ] Build frontend (`npm run build`)
- [ ] Test log file permissions
- [ ] Configure cleanup cron job
- [ ] Review privacy implications
- [ ] Update user documentation

### After Deploying
- [ ] Verify migrations applied
- [ ] Check log processor startup
- [ ] Test analytics toggle in UI
- [ ] Generate test traffic
- [ ] Verify dashboard displays data
- [ ] Monitor database size growth
- [ ] Set up backup strategy

## Maintenance

### Daily Tasks
- Monitor analytics table size
- Check log processor health

### Weekly Tasks
- Review analytics data quality
- Check for processing errors

### Monthly Tasks
- Analyze table growth rate
- Optimize queries if needed
- Review retention policy

### Quarterly Tasks
- Evaluate feature usage
- Plan enhancements
- Security audit

## Support

### Troubleshooting Resources
1. `TESTING_ANALYTICS.md` - Comprehensive troubleshooting guide
2. Backend logs - `docker logs npm2dev.core`
3. Database queries - Direct SQL inspection
4. Browser console - Frontend errors

### Common Issues & Solutions
See TESTING_ANALYTICS.md "Troubleshooting" section

## Metrics for Success

### Adoption Metrics
- % of hosts with analytics enabled
- Daily active analytics users
- Dashboard page views

### Performance Metrics
- Analytics query response time < 100ms
- Log processing lag < 1 second
- Dashboard load time < 500ms

### Data Quality Metrics
- % of requests successfully tracked
- Data completeness (all fields populated)
- Processing error rate < 0.1%

## Conclusion

The analytics feature is fully implemented with:
- ✅ Complete backend infrastructure
- ✅ Real-time log processing
- ✅ Per-site toggle control
- ✅ Dashboard visualization
- ✅ Comprehensive documentation

**Status:** Ready for testing and deployment

**Next Steps:**
1. Follow TESTING_ANALYTICS.md for comprehensive testing
2. Address any issues found during testing
3. Consider implementing recommended future enhancements
4. Deploy to production with monitoring
