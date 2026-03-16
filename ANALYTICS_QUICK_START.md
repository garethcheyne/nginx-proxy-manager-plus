# Analytics Feature - Quick Start Guide

## 🚀 Quick Test (5 Minutes)

### 1. Start Development Environment
```bash
cd nginx-proxy-manager
bash scripts/start-dev -f
```
**Wait for:** "Admin UI: http://127.0.0.1:3081"

### 2. Login
- URL: http://127.0.0.1:3081
- Email: admin@example.com
- Password: changeme

### 3. Check Analytics Menu
- Look for "Analytics" in left sidebar
- Click it → Should see dashboard

### 4. Create Test Host
1. Hosts → Proxy Hosts → Add
2. Fill in:
   - Domain: `test.local`
   - Scheme: `http`
   - Forward Host: `192.168.1.1`
   - Forward Port: `80`
3. **Check:** "Enable Analytics" (should be checked by default)
4. Save

### 5. Generate Traffic
```bash
curl -H "Host: test.local" http://localhost:3080/
curl -H "Host: test.local" http://localhost:3080/page1
curl -H "Host: test.local" http://localhost:3080/page2
```

### 6. View Analytics
1. Go to Analytics page
2. **Should see:**
   - Total Visits: 3
   - Top Pages showing /, /page1, /page2
   - Stats updating

## ✅ What to Verify

### Backend
- [ ] Migrations applied: `docker exec npm2dev.core ls /app/migrations`
- [ ] Analytics table exists: `psql -U npm -d npm -c "\d analytics"`
- [ ] Log processor running: `docker logs npm2dev.core | grep "log-processor"`

### Frontend
- [ ] Analytics menu visible
- [ ] Dashboard loads without errors
- [ ] Toggle appears in Proxy Host modal
- [ ] Toggle appears in Redirection Host modal
- [ ] Toggle appears in Dead Host modal (SSL tab)

### Functionality
- [ ] Traffic generates analytics records
- [ ] Dashboard shows real data
- [ ] Analytics respect enabled/disabled flag
- [ ] Data persists across page refresh

## 📊 Key Features

### Analytics Toggle
| Host Type | Location | Color | Default |
|-----------|----------|-------|---------|
| Proxy Host | Details tab, after Websockets | Green (bg-lime) | Enabled |
| Redirection Host | Details tab, after Block Exploits | Yellow (bg-yellow) | Enabled |
| Dead Host | SSL tab, after SSL options | Red (bg-red) | Enabled |

### Dashboard Metrics
- **Total Visits** - All tracked requests
- **Unique Visitors** - Distinct IP addresses
- **Success Rate** - % of 2xx/3xx responses
- **Countries** - Number of unique countries (if GeoIP enabled)

### Top Lists
- Top Pages (by visit count)
- Top Referrers (traffic sources)
- Status Codes (HTTP response distribution)
- Countries (geographic distribution)
- User Agents (browser/device types)

## 🔧 Quick Commands

### Check Analytics Count
```bash
docker exec npm2dev.core psql -U npm -d npm -c "SELECT COUNT(*) FROM analytics;"
```

### View Recent Analytics
```bash
docker exec npm2dev.core psql -U npm -d npm -c "SELECT * FROM analytics ORDER BY created_on DESC LIMIT 5;"
```

### Check Host Analytics Status
```bash
docker exec npm2dev.core psql -U npm -d npm -c "SELECT id, domain_names, analytics_enabled FROM proxy_host;"
```

### Watch Log Processing
```bash
docker logs -f npm2dev.core | grep analytics
```

### Manual Analytics Record (via API)
```bash
curl -X POST http://localhost:81/api/analytics/record \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "hostType": "proxy-host",
    "hostId": 1,
    "clientIp": "192.168.1.100",
    "requestMethod": "GET",
    "requestUri": "/test",
    "statusCode": 200
  }'
```

## 🐛 Quick Troubleshooting

### Problem: No Analytics Menu
**Fix:** Frontend not built
```bash
cd frontend && npm run build
```

### Problem: Dashboard Shows No Data
**Check:** Are there analytics records?
```bash
docker exec npm2dev.core psql -U npm -d npm -c "SELECT COUNT(*) FROM analytics;"
```

### Problem: Traffic Not Being Tracked
**Check:** 
1. Is analytics enabled? UI → Edit host → Check toggle
2. Is log processor running? `docker logs npm2dev.core | grep log-processor`
3. Are logs being written? `docker exec npm2dev.core ls /data/logs/`

### Problem: TypeScript Errors
**Fix:**
```bash
cd frontend
rm -rf node_modules
npm install
```

## 📚 Documentation Files

- **ANALYTICS.md** - Complete feature documentation
- **TESTING_ANALYTICS.md** - Comprehensive testing guide (30+ tests)
- **ANALYTICS_IMPLEMENTATION_SUMMARY.md** - Technical implementation details
- **ANALYTICS_QUICK_START.md** - This file

## 🎯 Next Steps

1. **Complete Testing:** Follow TESTING_ANALYTICS.md for thorough testing
2. **Review Security:** Check privacy implications for your use case
3. **Configure Retention:** Set up cleanup cron job
4. **Monitor Performance:** Watch database growth and query times
5. **Plan Enhancements:** Consider GeoIP, bot filtering, exports

## 💡 Pro Tips

- **Default Enabled:** All new hosts have analytics ON by default
- **Retroactive Tracking:** Enabling analytics on existing host starts tracking immediately
- **No Data Loss:** Disabling analytics stops tracking but keeps historical data
- **Per-Site Control:** Mix enabled and disabled hosts freely
- **Real-time Processing:** Log files are watched continuously
- **Auto-Refresh:** Dashboard updates every 60 seconds

## 🔐 Security Note

Analytics captures:
- IP addresses (consider privacy laws)
- User agents (device fingerprinting)
- Referrers (may contain sensitive data)

**Recommendation:** Review GDPR/privacy compliance for your jurisdiction.

## 📞 Support

For issues or questions:
1. Check TESTING_ANALYTICS.md troubleshooting section
2. Review browser console for errors
3. Check backend logs: `docker logs npm2dev.core`
4. Verify database connectivity

---

**Feature Status:** ✅ Complete and ready for testing

**Implementation Date:** November 20, 2025

**Files Modified:** 16 | **Files Created:** 11
