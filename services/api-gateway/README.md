# OmniClaw Enhanced API Gateway

Production-grade API Gateway with comprehensive rate limiting, API key management, and security features.

## Overview

The API Gateway provides a unified entry point for all OmniClaw Enhanced Cloud Functions with:

- **Authentication**: API key-based authentication with scoped permissions
- **Rate Limiting**: Multiple tier-based rate limiting strategies
- **Quota Management**: Per-user and per-key quota tracking
- **Security**: Request validation, CORS, DDoS protection
- **Monitoring**: Comprehensive analytics and metrics
- **99.99% Availability**: Production-ready infrastructure

## Features

### Authentication

- API key authentication via `Authorization: Bearer YOUR_API_KEY`
- Scoped permissions (price:read, story:write, etc.)
- IP whitelisting/blacklisting
- Key expiration and automatic rotation

### Rate Limiting

**Multiple Strategies:**
- Token Bucket Algorithm
- Sliding Window Log
- Fixed Window Counter
- Leaky Bucket
- Adaptive Rate Limiting
- Hierarchical Rate Limiting

**Tiers:**
- **Free**: 100 requests/hour, 10 requests/minute
- **Basic**: 1,000 requests/hour, 100 requests/minute
- **Pro**: 10,000 requests/hour, 1,000 requests/minute
- **Enterprise**: Unlimited, custom limits

### Quota Management

- Hourly, daily, and monthly quotas
- Endpoint-specific quotas
- Quota alerts at 80% usage
- Quota analytics and reporting
- Automatic quota reset

### API Key Management

- Secure API key generation
- Key rotation and expiration
- Usage analytics
- Key revocation
- Custom scopes and permissions

## Quick Start

### 1. Deploy API Gateway

```bash
cd api-gateway/deploy
./deploy-gateway.sh
```

### 2. Generate API Key

```bash
curl -X POST https://gateway.omniclaw-enhanced.com/keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_KEY" \
  -d '{
    "name": "Production API Key",
    "tier": "pro",
    "scopes": ["price:read", "story:write", "media:write"]
  }'
```

### 3. Make API Request

```bash
curl -X POST https://gateway.omniclaw-enhanced.com/price/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "userId": "user_123",
    "url": "https://amazon.com/dp/B08N5WRWNW",
    "threshold": 299.99
  }'
```

## Configuration

### Environment Variables

```bash
# Project
PROJECT_ID=omniclaw-enhanced
ENVIRONMENT=production

# Rate Limiting
RATE_LIMIT_STRATEGY=token-bucket
RATE_LIMIT_STORAGE=firestore

# Redis (optional)
REDIS_URL=redis://your-redis-instance
REDIS_TOKEN=your-redis-token

# Security
API_KEY_ENCRYPTION_KEY=your-encryption-key
ALLOWED_IPS=192.168.1.1,10.0.0.1
BLOCKED_IPS=

# Monitoring
ENABLE_MONITORING=true
ALERT_THRESHOLD=0.8
```

### Rate Limiting Configuration

Edit `rate-limiting/throttle-config.js` to customize:

```javascript
module.exports = {
  tiers: {
    free: {
      requestsPerMinute: 10,
      requestsPerHour: 100,
      requestsPerDay: 1000
    },
    // ... other tiers
  },
  endpoints: {
    '/story/generate': {
      POST: {
        limit: 50,
        window: 3600000,
        burst: 5
      }
    }
  }
};
```

## API Endpoints

### Health Check

```bash
GET /health
GET /health/ready
```

### Price Tracking

```bash
POST /price/products        # Add product
GET  /price/products        # List products
GET  /price/products/{id}   # Get product
GET  /price/products/{id}/history  # Price history
DELETE /price/products/{id} # Delete product
POST /price/check           # Check prices
```

### Story Generation

```bash
POST /story/tts             # Text-to-speech
POST /story/generate        # Generate story
GET  /story/voices          # Get voice profiles
```

### Media Control

```bash
POST /media/play            # Play media
POST /media/pause           # Pause playback
POST /media/search          # Search media
POST /media/unified-search  # Unified search
```

### Analytics

```bash
GET /analytics/usage        # Usage analytics
GET /analytics/quota        # Quota status
```

### API Keys

```bash
POST /keys                  # Create API key
GET  /keys                  # List keys
GET  /keys/{id}             # Get key details
DELETE /keys/{id}           # Revoke key
```

### Rate Limiting

```bash
GET /rate-limit/check       # Check rate limit status
```

## Response Headers

All API responses include rate limit headers:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1648392000
X-RateLimit-Tier: pro
```

When rate limited:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

## Error Responses

Standard error format:

```json
{
  "success": false,
  "error": "Error message",
  "timestamp": "2026-03-27T10:30:00.000Z",
  "requestId": "req_abc123def456"
}
```

## Monitoring

### Metrics Collected

- Request count and latency
- Rate limit violations
- API key usage
- Endpoint usage
- Error rates
- System health

### Dashboard

Access monitoring dashboard at:
```
https://dashboard.omniclaw-enhanced.com
```

### Alerts

Alerts triggered for:
- 80% quota usage
- High error rates
- Rate limit violations
- System degradation

## Security

### API Key Security

- Keys hashed using SHA-256
- Secure random generation (32 bytes)
- Environment-based prefixing
- IP restriction support

### Request Validation

- Schema validation for all requests
- Input sanitization
- SQL injection prevention
- XSS protection

### DDoS Protection

- IP-based rate limiting
- Request pattern analysis
- Automatic blocking of suspicious IPs
- CAPTCHA integration support

## Deployment

### Production Deployment

```bash
cd api-gateway/deploy
./deploy-gateway.sh production
```

### Staging Deployment

```bash
./deploy-gateway.sh staging
```

### Rollback

```bash
./rollback-gateway.sh
```

## Troubleshooting

### Rate Limit Issues

**Problem**: 429 Too Many Requests

**Solutions**:
1. Check rate limit status: `GET /rate-limit/check`
2. Wait for `Retry-After` seconds
3. Upgrade tier for higher limits
4. Implement exponential backoff

### API Key Issues

**Problem**: 401 Unauthorized

**Solutions**:
1. Verify API key is correct
2. Check key hasn't expired
3. Ensure key has required scopes
4. Generate new key if needed

### Performance Issues

**Problem**: Slow response times

**Solutions**:
1. Check system load
2. Review rate limit configuration
3. Enable caching
4. Scale infrastructure

## Best Practices

### For Developers

1. **Use exponential backoff** for retries
2. **Cache responses** when appropriate
3. **Monitor rate limit headers** in all responses
4. **Implement graceful degradation** when rate limited
5. **Use appropriate tier** for your use case

### For Operations

1. **Monitor metrics** daily
2. **Set up alerts** for critical thresholds
3. **Review rate limit violations** weekly
4. **Update quotas** based on usage patterns
5. **Test failover scenarios** monthly

## Support

For issues or questions:
- Documentation: `/docs`
- Status Page: `https://status.omniclaw-enhanced.com`
- Email: support@omniclaw-enhanced.com
- GitHub Issues: `https://github.com/omniclaw-enhanced/gateway/issues`

## License

MIT License - see LICENSE file for details

## Changelog

### Version 1.0.0 (2026-03-27)
- Initial production release
- Full API gateway functionality
- Comprehensive rate limiting
- API key management
- Monitoring and analytics

---

**Generated by Claude Code**
**Last Updated**: 2026-03-27
**Version**: 1.0.0
