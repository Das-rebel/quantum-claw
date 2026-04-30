const { getHealthStatus, getResilienceStats } = require('../resilience');

const DEFAULT_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const DEFAULT_SERVICE = 'omniclaw';
const PROCESS_START_TIME_SECONDS = Math.floor(Date.now() / 1000);

const metricStore = {
  requestsTotal: new Map(),
  requestDurationBuckets: new Map(),
  requestDurationSum: new Map(),
  requestDurationCount: new Map(),
  inflightRequests: new Map()
};

function getMetricKey(labels) {
  return JSON.stringify(labels);
}

function escapeLabelValue(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
}

function formatLabels(labels = {}) {
  const entries = Object.entries(labels)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right));

  if (entries.length === 0) {
    return '';
  }

  const rendered = entries
    .map(([key, value]) => `${key}="${escapeLabelValue(value)}"`)
    .join(',');

  return `{${rendered}}`;
}

function incrementMetric(map, labels, amount = 1) {
  const key = getMetricKey(labels);
  const current = map.get(key) || 0;
  map.set(key, current + amount);
}

function normalizeRoute(route) {
  if (!route) {
    return 'unknown';
  }

  return route === '/' ? '/' : route.replace(/\/+$/, '') || '/';
}

function resolveRoute(req) {
  if (req.route && req.route.path) {
    return normalizeRoute(req.baseUrl ? `${req.baseUrl}${req.route.path}` : req.route.path);
  }

  if (req.baseUrl && req.path) {
    return normalizeRoute(`${req.baseUrl}${req.path}`);
  }

  return normalizeRoute(req.originalUrl || req.path || 'unknown');
}

function getServiceName(serviceName) {
  return serviceName || DEFAULT_SERVICE;
}

function recordHttpRequest({
  serviceName = DEFAULT_SERVICE,
  method = 'GET',
  route = 'unknown',
  statusCode = 200,
  durationSeconds = 0,
  buckets = DEFAULT_BUCKETS
}) {
  const labels = {
    service: getServiceName(serviceName),
    method: String(method).toUpperCase(),
    route: normalizeRoute(route),
    status_code: String(statusCode)
  };

  incrementMetric(metricStore.requestsTotal, labels, 1);
  incrementMetric(metricStore.requestDurationSum, labels, durationSeconds);
  incrementMetric(metricStore.requestDurationCount, labels, 1);

  for (const bucket of buckets) {
    if (durationSeconds <= bucket) {
      incrementMetric(metricStore.requestDurationBuckets, { ...labels, le: String(bucket) }, 1);
    }
  }

  incrementMetric(metricStore.requestDurationBuckets, { ...labels, le: '+Inf' }, 1);
}

function incrementInflight(serviceName, route, amount) {
  const labels = {
    service: getServiceName(serviceName),
    route: normalizeRoute(route)
  };

  const key = getMetricKey(labels);
  const current = metricStore.inflightRequests.get(key) || 0;
  const next = current + amount;

  if (next <= 0) {
    metricStore.inflightRequests.delete(key);
    return;
  }

  metricStore.inflightRequests.set(key, next);
}

function createMetricsMiddleware(options = {}) {
  const {
    serviceName = DEFAULT_SERVICE,
    buckets = DEFAULT_BUCKETS,
    ignoredPaths = ['/metrics', '/metricsHandler']
  } = options;

  const ignored = new Set(ignoredPaths.map(normalizeRoute));

  return function metricsMiddleware(req, res, next) {
    const route = resolveRoute(req);

    if (ignored.has(route)) {
      next();
      return;
    }

    const startedAt = process.hrtime.bigint();
    incrementInflight(serviceName, route, 1);

    res.on('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      incrementInflight(serviceName, route, -1);
      recordHttpRequest({
        serviceName,
        method: req.method,
        route: resolveRoute(req),
        statusCode: res.statusCode,
        durationSeconds,
        buckets
      });
    });

    next();
  };
}

function appendMetric(lines, name, type, help, values) {
  lines.push(`# HELP ${name} ${help}`);
  lines.push(`# TYPE ${name} ${type}`);

  for (const value of values) {
    lines.push(`${name}${formatLabels(value.labels)} ${value.value}`);
  }
}

function collectProcessMetrics(serviceName) {
  const cpuUsage = process.cpuUsage();
  const memoryUsage = process.memoryUsage();

  return {
    cpuUsage,
    memoryUsage,
    serviceName: getServiceName(serviceName)
  };
}

function renderMetrics(options = {}) {
  const serviceName = getServiceName(options.serviceName);
  const lines = [];
  const { cpuUsage, memoryUsage } = collectProcessMetrics(serviceName);
  const resilienceHealth = getHealthStatus();
  const resilienceStats = getResilienceStats();
  const openCircuits = resilienceHealth.circuitBreakers.filter((breaker) => !breaker.healthy).length;
  const appHealth = openCircuits === 0 ? 1 : 0;

  appendMetric(
    lines,
    'omniclaw_http_requests_total',
    'counter',
    'Total HTTP requests handled by OmniClaw.',
    Array.from(metricStore.requestsTotal.entries()).map(([key, value]) => ({
      labels: JSON.parse(key),
      value
    }))
  );

  appendMetric(
    lines,
    'omniclaw_http_request_duration_seconds_bucket',
    'histogram',
    'HTTP request latency buckets for OmniClaw.',
    Array.from(metricStore.requestDurationBuckets.entries()).map(([key, value]) => ({
      labels: JSON.parse(key),
      value
    }))
  );

  appendMetric(
    lines,
    'omniclaw_http_request_duration_seconds_sum',
    'histogram',
    'HTTP request latency sum for OmniClaw.',
    Array.from(metricStore.requestDurationSum.entries()).map(([key, value]) => ({
      labels: JSON.parse(key),
      value: value.toFixed(6)
    }))
  );

  appendMetric(
    lines,
    'omniclaw_http_request_duration_seconds_count',
    'histogram',
    'HTTP request latency count for OmniClaw.',
    Array.from(metricStore.requestDurationCount.entries()).map(([key, value]) => ({
      labels: JSON.parse(key),
      value
    }))
  );

  appendMetric(
    lines,
    'omniclaw_http_inflight_requests',
    'gauge',
    'Current in-flight HTTP requests for OmniClaw.',
    Array.from(metricStore.inflightRequests.entries()).map(([key, value]) => ({
      labels: JSON.parse(key),
      value
    }))
  );

  appendMetric(
    lines,
    'omniclaw_process_memory_bytes',
    'gauge',
    'Node.js process memory usage in bytes.',
    [
      { labels: { service: serviceName, type: 'rss' }, value: memoryUsage.rss },
      { labels: { service: serviceName, type: 'heap_total' }, value: memoryUsage.heapTotal },
      { labels: { service: serviceName, type: 'heap_used' }, value: memoryUsage.heapUsed },
      { labels: { service: serviceName, type: 'external' }, value: memoryUsage.external },
      { labels: { service: serviceName, type: 'array_buffers' }, value: memoryUsage.arrayBuffers || 0 }
    ]
  );

  appendMetric(
    lines,
    'omniclaw_process_cpu_seconds_total',
    'counter',
    'Node.js process CPU time in seconds.',
    [
      { labels: { service: serviceName, mode: 'user' }, value: (cpuUsage.user / 1e6).toFixed(6) },
      { labels: { service: serviceName, mode: 'system' }, value: (cpuUsage.system / 1e6).toFixed(6) }
    ]
  );

  appendMetric(
    lines,
    'omniclaw_process_uptime_seconds',
    'gauge',
    'Node.js process uptime in seconds.',
    [{ labels: { service: serviceName }, value: process.uptime().toFixed(3) }]
  );

  appendMetric(
    lines,
    'omniclaw_process_start_time_seconds',
    'gauge',
    'Unix timestamp when the OmniClaw process started.',
    [{ labels: { service: serviceName }, value: PROCESS_START_TIME_SECONDS }]
  );

  appendMetric(
    lines,
    'omniclaw_build_info',
    'gauge',
    'Build and deployment metadata for OmniClaw.',
    [{
      labels: {
        service: serviceName,
        version: process.env.VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        region: process.env.GCP_REGION || 'asia-south1'
      },
      value: 1
    }]
  );

  appendMetric(
    lines,
    'omniclaw_health_status',
    'gauge',
    'Application health status where 1 is healthy and 0 is degraded.',
    [{ labels: { service: serviceName }, value: appHealth }]
  );

  appendMetric(
    lines,
    'omniclaw_resilience_circuits',
    'gauge',
    'Circuit breaker counts grouped by state.',
    [
      { labels: { service: serviceName, state: 'open' }, value: resilienceStats.openCircuits },
      { labels: { service: serviceName, state: 'half_open' }, value: resilienceStats.halfOpenCircuits },
      { labels: { service: serviceName, state: 'closed' }, value: resilienceStats.closedCircuits }
    ]
  );

  appendMetric(
    lines,
    'omniclaw_resilience_requests_total',
    'counter',
    'Aggregate resilience activity counters across all circuit breakers.',
    [
      { labels: { service: serviceName, result: 'requests' }, value: resilienceStats.totalRequests },
      { labels: { service: serviceName, result: 'successes' }, value: resilienceStats.totalSuccesses },
      { labels: { service: serviceName, result: 'failures' }, value: resilienceStats.totalFailures },
      { labels: { service: serviceName, result: 'rejected' }, value: resilienceStats.totalRejected }
    ]
  );

  appendMetric(
    lines,
    'omniclaw_circuit_breaker_state',
    'gauge',
    'Circuit breaker state represented as one-hot gauges.',
    resilienceHealth.circuitBreakers.flatMap((breaker) => ([
      {
        labels: { service: serviceName, breaker: breaker.name, state: 'closed' },
        value: breaker.state === 'CLOSED' ? 1 : 0
      },
      {
        labels: { service: serviceName, breaker: breaker.name, state: 'half_open' },
        value: breaker.state === 'HALF_OPEN' ? 1 : 0
      },
      {
        labels: { service: serviceName, breaker: breaker.name, state: 'open' },
        value: breaker.state === 'OPEN' ? 1 : 0
      }
    ]))
  );

  appendMetric(
    lines,
    'omniclaw_circuit_breaker_open',
    'gauge',
    'Indicates whether a circuit breaker is open.',
    resilienceHealth.circuitBreakers.map((breaker) => ({
      labels: { service: serviceName, breaker: breaker.name },
      value: breaker.state === 'OPEN' ? 1 : 0
    }))
  );

  appendMetric(
    lines,
    'omniclaw_circuit_breaker_failure_rate',
    'gauge',
    'Observed failure rate for each circuit breaker.',
    resilienceHealth.circuitBreakers.map((breaker) => ({
      labels: { service: serviceName, breaker: breaker.name },
      value: breaker.failureRate.toFixed(6)
    }))
  );

  appendMetric(
    lines,
    'omniclaw_circuit_breaker_requests_total',
    'counter',
    'Per-circuit breaker request counters.',
    resilienceHealth.circuitBreakers.flatMap((breaker) => ([
      { labels: { service: serviceName, breaker: breaker.name, result: 'requests' }, value: breaker.stats.requests },
      { labels: { service: serviceName, breaker: breaker.name, result: 'successes' }, value: breaker.stats.successes },
      { labels: { service: serviceName, breaker: breaker.name, result: 'failures' }, value: breaker.stats.failures },
      { labels: { service: serviceName, breaker: breaker.name, result: 'rejected' }, value: breaker.stats.rejected }
    ]))
  );

  return `${lines.join('\n')}\n`;
}

function createMetricsHandler(options = {}) {
  const serviceName = getServiceName(options.serviceName);

  return function metricsHandler(req, res) {
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(renderMetrics({ serviceName }));
  };
}

function resetMetrics() {
  metricStore.requestsTotal.clear();
  metricStore.requestDurationBuckets.clear();
  metricStore.requestDurationSum.clear();
  metricStore.requestDurationCount.clear();
  metricStore.inflightRequests.clear();
}

module.exports = {
  DEFAULT_BUCKETS,
  createMetricsHandler,
  createMetricsMiddleware,
  recordHttpRequest,
  renderMetrics,
  resetMetrics
};
