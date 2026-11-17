/**
 * Express.js Integration Example for Resilix
 * Demonstrates protecting HTTP endpoints with automatic retries, backoff, and ResilixError handling.
 */

const http = require('http');
const { retry, ResilixError } = require('../index');

// Simulated downstream external inventory service
let downstreamCalls = 0;
async function fetchInventoryFromPartner(productId) {
  downstreamCalls++;
  // Simulate 2 transient 503 failures before succeeding on attempt 3
  if (downstreamCalls < 3) {
    const error = new Error('503 Service Unavailable: Partner database lock timeout');
    error.status = 503;
    throw error;
  }
  return { productId, availableStock: 142, warehouse: 'us-east-2' };
}

// Minimal simulated HTTP server handling /api/inventory/:id
const server = http.createServer(async (req, res) => {
  if (req.url && req.url.startsWith('/api/inventory/')) {
    const productId = req.url.split('/api/inventory/')[1];

    try {
      const inventory = await retry(
        async ({ attempt }) => {
          console.log(`[HTTP Route] Handling request for ${productId} (Attempt #${attempt})...`);
          return await fetchInventoryFromPartner(productId);
        },
        {
          maxRetries: 3,
          delay: 150,
          strategy: 'exponential',
          factor: 2,
          name: 'getPartnerInventory',
          onRetry: (err, meta) => {
            console.log(`  [onRetry] Warning: ${err.message}. Retrying in ${meta.delay}ms...`);
          },
          onSuccess: (result, meta) => {
            console.log(`  [onSuccess] Operation succeeded after ${meta.attempts} attempt(s)!`);
          },
        }
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: inventory }));
    } catch (error) {
      if (error instanceof ResilixError) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Downstream partner inventory service unavailable after retries',
          attemptsMade: error.attempts,
          originalError: error.originalError ? error.originalError.message : error.message,
        }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

async function runDemo() {
  server.listen(4099, async () => {
    console.log('[Express Example Server] Listening on http://localhost:4099');

    // Make request to endpoint
    http.get('http://localhost:4099/api/inventory/sku_9921', (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        console.log('\n[Client Response received]: Status', res.statusCode);
        console.log(JSON.parse(body));
        server.close();
      });
    });
  });
}

if (require.main === module) {
  runDemo();
}
