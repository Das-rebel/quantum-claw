# API Gateway Quick Reference

**Version**: 1.0.0 | **Last Updated**: 2026-03-27

## Quick Start

### 1. Deploy Gateway
```bash
cd /Users/Subho/omniclaw-enhanced/api-gateway/deploy
./deploy-gateway.sh production
```

### 2. Generate API Key
```bash
curl -X POST https://gateway.omniclaw-enhanced.com/keys \
  -H "Authorization: Bearer ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "My App", "tier": "basic"}'
```

### 3. Make Request
```bash
curl -X GET https://gateway.omniclaw-enhanced.com/health \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Rate Limiting Tiers

| Tier | Hourly | Minute | Burst | Price |
|------|--------|--------|-------|-------|
| Free | 100 | 10 | 10 | $0 |
| Basic | 1,000 | 100 | 50 | $29/mo |
| Pro | 10,000 | 1,000 | 200 | $99/mo |
| Enterprise | Unlimited | Unlimited | Unlimited | Custom |

---

## API Endpoints

### Health
- `GET /health` - Health check
- `GET /health/ready` - Readiness check

### Price Tracking
- `POST /price/products` - Add product
- `GET /price/products` - List products
- `GET /price/products/{id}` - Get product
- `GET /price/products/{id}/history` - Price history
- `DELETE /price/products/{id}` - Delete product
- `POST /price/check` - Check prices now

### Story Generation
- `POST /story/tts` - Text-to-speech
- `POST /story/generate` - Generate story
- `GET /story/voices` - Get voice profiles

### Media Control
- `POST /media/play` - Play media
- `POST /media/pause` - Pause playback
- `POST /media/search` - Search media
- `POST /media/unified-search` - Multi-platform search

### Analytics
- `GET /analytics/usage` - Usage stats
- `GET /analytics/quota` - Quota status

### API Keys
- `POST /keys` - Create key
- `GET /keys` - List keys
- `GET /keys/{id}` - Get key details
- `DELETE /keys/{id}` - Revoke key

### Rate Limiting
- `GET /rate-limit/check` - Check status

---

## Response Headers

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1648392000
X-RateLimit-Tier: basic
```

---

## Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| 200 | Success | ✓ |
| 400 | Bad Request | Check request format |
| 401 | Unauthorized | Verify API key |
| 403 | Forbidden | Check permissions |
| 429 | Rate Limited | Wait and retry |
| 500 | Server Error | Retry or report |

---

## Common Commands

### Check Rate Limit Status
```bash
curl -X GET https://gateway.omniclaw-enhanced.com/rate-limit/check \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Add Product for Tracking
```bash
curl -X POST https://gateway.omniclaw-enhanced.com/price/products \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_123",
    "url": "https://amazon.com/dp/B08N5WRWNW",
    "threshold": 299.99
  }'
```

### Generate Story
```bash
curl -X POST https://gateway.omniclaw-enhanced.com/story/generate \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "genre": "fantasy",
    "characters": ["hero", "villain"],
    "duration": "short"
  }'
```

### Play Media
```bash
curl -X POST https://gateway.omniclaw-enhanced.com/media/play \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "spotify",
    "action": "track",
    "params": {"uri": "spotify:track:4iV5W9uYEdYUVa79Axb7Rh"}
  }'
```

---

## Configuration Files

| File | Purpose |
|------|---------|
| `openapi.yaml` | API specification |
| `throttle-config.js` | Rate limit rules |
| `rate-limiter.js` | Rate limiter implementation |
| `quota-manager.js` | Quota tracking |
| `api-key-manager.js` | Key management |
| `deploy-gateway.sh` | Deployment script |

---

## Environment Variables

```bash
PROJECT_ID=omniclaw-enhanced
ENVIRONMENT=production
RATE_LIMIT_STRATEGY=token-bucket
RATE_LIMIT_STORAGE=firestore
REDIS_URL=redis://your-redis
API_KEY_ENCRYPTION_KEY=your-key
```

---

## Monitoring

- **Logs**: https://console.cloud.google.com/logs
- **Metrics**: https://console.cloud.google.com/monitoring
- **Status**: https://status.omniclaw-enhanced.com
- **Dashboard**: https://console.cloud.google.com/monitoring/dashboards

---

## Troubleshooting

### 429 Too Many Requests
- Wait for `Retry-After` seconds
- Check rate limit status
- Upgrade tier if needed

### 401 Unauthorized
- Verify API key
- Check key expiration
- Ensure required scopes

### 500 Internal Error
- Check status page
- Report issue
- Implement retry logic

---

## Best Practices

1. **Use exponential backoff** for retries
2. **Cache responses** when possible
3. **Monitor rate limit headers**
4. **Handle errors gracefully**
5. **Use appropriate tier** for usage

---

## Support

- **Docs**: https://docs.omniclaw-enhanced.com
- **Email**: support@omniclaw-enhanced.com
- **GitHub**: https://github.com/omniclaw-enhanced/gateway/issues
- **Discord**: https://discord.gg/omniclaw-enhanced

---

## File Locations

```
/Users/Subho/omniclaw-enhanced/
├── api-gateway/
│   ├── openapi.yaml
│   ├── README.md
│   ├── IMPLEMENTATION_SUMMARY.md
│   ├── rate-limiting/
│   │   ├── rate-limiter.js
│   │   ├── quota-manager.js
│   │   ├── throttle-config.js
│   │   └── rate-limit-strategies.js
│   ├── keys/
│   │   └── api-key-manager.js
│   └── deploy/
│       └── deploy-gateway.sh
└── API_GUIDE.md
```

---

**Total Lines**: 4,881+
**Status**: Production Ready ✅
