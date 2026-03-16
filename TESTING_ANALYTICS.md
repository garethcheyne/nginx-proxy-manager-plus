# Analytics Feature Testing Guide

## Overview
This document provides comprehensive testing instructions for the new analytics feature that tracks visitor statistics for proxy hosts, redirection hosts, and dead hosts.

## Prerequisites

### 1. Install Dependencies
```bash
# Backend
cd backend
npm install

# Frontend  
cd frontend
npm install
```

### 2. Start Development Environment

#### Option A: Using Docker (Recommended)
```bash
# Start the full development stack
bash scripts/start-dev

# Wait for containers to be healthy
# Access points:
# - Admin UI: http://127.0.0.1:3081
# - Nginx: http://127.0.0.1:3080
# - Swagger: http://127.0.0.1:3082
```

#### Option B: Manual Setup
```bash
# 1. Start database (PostgreSQL recommended)
docker run -d \
  --name npm-postgres \
  -e POSTGRES_USER=npm \
  -e POSTGRES_PASSWORD=npmpass \
  -e POSTGRES_DB=npm \
  -p 5432:5432 \
  postgres:17

# 2. Run migrations
cd backend
export DB_POSTGRES_HOST=localhost
export DB_POSTGRES_PORT=5432
export DB_POSTGRES_USER=npm
export DB_POSTGRES_PASSWORD=npmpass
export DB_POSTGRES_NAME=npm
npm run migrate

# 3. Start backend
node index.js

# 4. Start frontend (in another terminal)
cd frontend
npm run dev
```

## Testing Checklist

### Phase 1: Database Migration Testing

#### Test 1.1: Analytics Table Creation
```bash
cd backend
npx knex migrate:list
```
**Expected:** Should show `20251120000000_analytics.js` migration

**Verify:**
```sql
-- Connect to database
\c npm

-- Check table exists with correct schema
\d analytics

-- Should show columns:
-- - id (integer, primary key)
-- - proxy_host_id (integer, nullable)
-- - redirection_host_id (integer, nullable)
-- - dead_host_id (integer, nullable)
-- - host_type (varchar, not null)
-- - domain_name (varchar)
-- - client_ip (varchar)
-- - user_agent (text)
-- - referer (text)
-- - request_method (varchar)
-- - request_uri (text)
-- - status_code (integer)
-- - response_time (decimal)
-- - bytes_sent (integer)
-- - country_code (varchar)
-- - meta (json)
-- - created_on (timestamp)
-- - modified_on (timestamp)
```

#### Test 1.2: Analytics Enabled Flag Migration
```sql
-- Check analytics_enabled column exists on all host tables
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name IN ('proxy_host', 'redirection_host', 'dead_host')
  AND column_name = 'analytics_enabled';

-- Expected: 3 rows, each with:
-- - data_type: tinyint/boolean
-- - column_default: 1 (true)
```

### Phase 2: Backend API Testing

#### Test 2.1: Analytics Endpoints Available
```bash
# List all analytics (empty initially)
curl -X GET http://localhost:81/api/analytics \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: {"data": [], "total": 0}

# Get analytics count
curl -X GET http://localhost:81/api/analytics/count \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: {"count": 0}

# Get analytics stats
curl -X GET http://localhost:81/api/analytics/stats \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: Stats object with zeros for all metrics
```

#### Test 2.2: Record Analytics Manually
```bash
curl -X POST http://localhost:81/api/analytics/record \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "hostType": "proxy-host",
    "hostId": 1,
    "clientIp": "192.168.1.100",
    "userAgent": "Mozilla/5.0 Test Browser",
    "requestMethod": "GET",
    "requestUri": "/test",
    "statusCode": 200
  }'

# Expected: 201 Created with analytics record
```

### Phase 3: Frontend UI Testing

#### Test 3.1: Analytics Menu Item
1. Login to admin UI at http://localhost:3081
2. Default credentials: `admin@example.com` / `changeme`
3. **Verify:** Left sidebar shows "Analytics" menu item with chart icon
4. **Click** on Analytics menu
5. **Expected:** Navigates to `/analytics` route

#### Test 3.2: Analytics Dashboard Display
1. Navigate to Analytics page
2. **Verify visible elements:**
   - Page title: "Analytics Dashboard"
   - Subtitle: "Visitor statistics and traffic insights"
   - 4 stat cards:
     - Total Visits
     - Unique Visitors
     - Success Rate
     - Countries
   - Tables for:
     - Top Pages
     - Top Referrers
     - Status Codes
     - Countries
     - User Agents

#### Test 3.3: Proxy Host Modal - Analytics Toggle
1. Go to Hosts → Proxy Hosts
2. Click "Add Proxy Host"
3. **Verify** in Details tab, after "Websockets Support":
   - Checkbox labeled "Enable Analytics"
   - Default state: **checked** (enabled)
   - Color when enabled: **green** (bg-lime)
4. Fill required fields:
   - Domain Names: `test.example.com`
   - Scheme: `http`
   - Forward Hostname: `192.168.1.10`
   - Forward Port: `8080`
5. **Test toggle:**
   - Uncheck "Enable Analytics"
   - Save host
   - Edit host again
   - **Verify:** Analytics toggle reflects saved state
6. **Save** with analytics enabled

#### Test 3.4: Redirection Host Modal - Analytics Toggle
1. Go to Hosts → Redirection Hosts
2. Click "Add Redirection Host"
3. **Verify** in Details tab, after "Block Common Exploits":
   - Checkbox labeled "Enable Analytics"
   - Default state: **checked**
   - Color when enabled: **yellow** (bg-yellow)
4. Fill required fields:
   - Domain Names: `redirect.example.com`
   - Scheme: `https`
   - Forward Domain Name: `newsite.example.com`
5. **Toggle** analytics off, save, and verify state persists

#### Test 3.5: Dead Host Modal - Analytics Toggle
1. Go to Hosts → 404 Hosts
2. Click "Add 404 Host"
3. **Verify** in SSL tab, after SSL options:
   - Checkbox labeled "Enable Analytics"
   - Default state: **checked**
   - Color when enabled: **red** (bg-red)
4. Fill required fields:
   - Domain Names: `dead.example.com`
5. **Toggle** analytics, save, verify persistence

### Phase 4: Log Processing Testing

#### Test 4.1: Log Format Configuration
```bash
# Check Nginx log format includes analytics format
docker exec npm2dev.core cat /etc/nginx/conf.d/include/log.conf

# Expected: Contains log_format 'analytics' with all required fields
```

#### Test 4.2: Host-Specific Log Files
```bash
# Create a proxy host and check log file
ls -la /data/logs/

# Expected files:
# - proxy-host-{id}_access.log
# - proxy-host-{id}_error.log
```

#### Test 4.3: Real-time Log Processing
1. Create a proxy host with **analytics enabled**
2. Check backend logs for log processor startup:
   ```bash
   docker logs -f npm2dev.core | grep "log-processor"
   ```
3. **Expected:** "Started watching log file: /data/logs/proxy-host-X_access.log"

4. Generate test traffic:
   ```bash
   # Send test requests
   curl -H "Host: test.example.com" http://localhost:3080/
   curl -H "Host: test.example.com" http://localhost:3080/page1
   curl -H "Host: test.example.com" http://localhost:3080/page2
   ```

5. **Verify analytics recorded:**
   ```bash
   curl -X GET http://localhost:81/api/analytics \
     -H "Authorization: Bearer YOUR_TOKEN"
   
   # Expected: 3 analytics records
   ```

#### Test 4.4: Analytics Toggle Enforcement
1. Create two proxy hosts:
   - Host A: Analytics **enabled**
   - Host B: Analytics **disabled**
2. Send requests to both:
   ```bash
   curl -H "Host: host-a.example.com" http://localhost:3080/
   curl -H "Host: host-b.example.com" http://localhost:3080/
   ```
3. **Query analytics:**
   ```bash
   curl http://localhost:81/api/analytics | jq
   ```
4. **Expected:** Only Host A requests appear in analytics

### Phase 5: Analytics Dashboard Live Testing

#### Test 5.1: Data Population
1. Generate diverse traffic:
   ```bash
   # Different pages
   for page in / /about /contact /products /services; do
     curl -H "Host: test.example.com" http://localhost:3080$page
   done
   
   # Different referrers
   curl -H "Host: test.example.com" \
        -H "Referer: https://google.com" \
        http://localhost:3080/
   
   curl -H "Host: test.example.com" \
        -H "Referer: https://facebook.com" \
        http://localhost:3080/
   
   # Different user agents
   curl -H "Host: test.example.com" \
        -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" \
        http://localhost:3080/
   
   curl -H "Host: test.example.com" \
        -A "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6)" \
        http://localhost:3080/
   ```

2. **Refresh analytics dashboard**
3. **Verify:**
   - Total Visits increases
   - Top Pages shows different URIs
   - Top Referrers shows Google, Facebook
   - User Agents shows different browsers
   - Success Rate calculates correctly

#### Test 5.2: Filtering by Date Range
1. Dashboard should auto-refresh every 60 seconds
2. **Verify** stats update without page reload
3. Generate traffic over time and observe real-time updates

#### Test 5.3: Host-Specific Analytics
```bash
# Query analytics for specific host
curl -X GET http://localhost:81/api/analytics/proxy-host/1 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: Only analytics for proxy host ID 1
```

### Phase 6: Database Query Performance

#### Test 6.1: Index Usage
```sql
-- Explain query plan for common queries
EXPLAIN ANALYZE
SELECT * FROM analytics
WHERE proxy_host_id = 1
AND created_on > NOW() - INTERVAL '7 days';

-- Should use index: idx_analytics_proxy_host_id

EXPLAIN ANALYZE
SELECT domain_name, COUNT(*) as visits
FROM analytics
WHERE created_on > NOW() - INTERVAL '30 days'
GROUP BY domain_name
ORDER BY visits DESC
LIMIT 10;

-- Should use index: idx_analytics_created_on
```

#### Test 6.2: Cleanup Function
```bash
# Test analytics cleanup (removes records older than 90 days)
cd backend
node -e "
  import('./internal/analytics.js').then(m => {
    m.default.cleanup(90).then(deleted => {
      console.log('Deleted records:', deleted);
    });
  });
"
```

### Phase 7: Error Handling

#### Test 7.1: Invalid Analytics Recording
```bash
# Missing required fields
curl -X POST http://localhost:81/api/analytics/record \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected: 400 Bad Request with validation errors
```

#### Test 7.2: Non-existent Host
```bash
curl -X GET http://localhost:81/api/analytics/proxy-host/99999 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: Empty result (not 404, as host may have been deleted)
```

#### Test 7.3: Log File Missing
1. Delete a log file while log processor is running
2. **Verify:** Backend logs show error but doesn't crash
3. Recreate log file
4. **Verify:** Log processor resumes watching

## Success Criteria

### ✅ All Tests Pass When:
1. Database migrations execute without errors
2. Analytics table and columns created correctly
3. All API endpoints respond correctly
4. Analytics toggle appears in all 3 host modals
5. Toggle defaults to enabled (checked)
6. Toggle state persists across edits
7. Log processor watches log files
8. Analytics records are created from real traffic
9. Analytics are only recorded for enabled hosts
10. Dashboard displays statistics correctly
11. Dashboard auto-refreshes data
12. No TypeScript compilation errors
13. No React console errors
14. Cleanup function removes old records

## Performance Benchmarks

### Expected Metrics:
- **API Response Time:** < 100ms for analytics queries
- **Log Processing:** < 10ms per log line
- **Dashboard Load:** < 500ms
- **Database Query:** < 50ms with indexes

## Troubleshooting

### Issue: Analytics Not Recording
**Check:**
1. Is log processor running? `docker logs npm2dev.core | grep "log-processor"`
2. Is analytics enabled on host? Check database: `SELECT analytics_enabled FROM proxy_host WHERE id = X;`
3. Is log file being created? `ls /data/logs/`
4. Are logs being written? `tail -f /data/logs/proxy-host-X_access.log`

### Issue: Dashboard Shows No Data
**Check:**
1. Are analytics records in database? `SELECT COUNT(*) FROM analytics;`
2. Is date range correct?
3. Check browser console for API errors
4. Verify API endpoint: `curl http://localhost:81/api/analytics/stats`

### Issue: TypeScript Errors
**Fix:**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Issue: Migration Fails
**Fix:**
```bash
cd backend
npx knex migrate:rollback
npx knex migrate:latest
```

## Additional Notes

### Log Format
The analytics log format captures:
- Remote address (client IP)
- Request time
- Request method and URI
- HTTP status
- Body bytes sent
- Referer
- User agent
- Response time
- Host header

### Data Retention
- Default: Analytics kept for 90 days
- Configurable via cleanup cron job
- Recommended: Run daily at 2 AM

### Privacy Considerations
- IP addresses are stored (consider anonymization)
- User agents are logged (device fingerprinting)
- Referers may contain sensitive URLs
- Consider GDPR compliance for EU users

## Automated Testing (Future)

### Cypress E2E Tests
```javascript
describe('Analytics Feature', () => {
  it('should show analytics toggle in proxy host modal', () => {
    cy.visit('/hosts/proxy');
    cy.contains('Add Proxy Host').click();
    cy.get('#analyticsEnabled').should('exist');
    cy.get('#analyticsEnabled').should('be.checked');
  });
  
  it('should record analytics for enabled hosts', () => {
    // Create host with analytics enabled
    // Send test request
    // Verify analytics API has record
  });
});
```

### Unit Tests
```javascript
// backend/internal/analytics.test.js
describe('Analytics Internal API', () => {
  test('records analytics entry', async () => {
    const result = await analytics.record({
      hostType: 'proxy-host',
      hostId: 1,
      // ...
    });
    expect(result.id).toBeDefined();
  });
});
```

## Conclusion
After completing all tests, the analytics feature should be fully functional and ready for production use. Document any deviations or additional findings in this section.
