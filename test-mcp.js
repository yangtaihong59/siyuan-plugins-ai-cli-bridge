#!/usr/bin/env node

/**
 * MCP Test Script - Test the connection to SiYuan API
 */

const http = require('http');

const SIYUAN_TOKEN = process.env.SIYUAN_TOKEN || '';
const SIYUAN_URL = process.env.SIYUAN_URL || 'http://localhost:18080';

console.error(`[Test] SiYuan URL: ${SIYUAN_URL}`);
console.error(`[Test] Token: ${SIYUAN_TOKEN.substring(0, 20)}...`);

// Parse URL
const url = new URL(SIYUAN_URL);
const hostname = url.hostname;
const port = url.port || (url.protocol === 'https:' ? 443 : 80);

console.error(`[Test] Parsed: ${hostname}:${port}`);

// Test basic connectivity
function testConnection() {
  return new Promise((resolve, reject) => {
    const testData = JSON.stringify({});

    const options = {
      hostname: hostname,
      port: port,
      path: '/api/system/version',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SIYUAN_TOKEN}`,
        'Content-Length': Buffer.byteLength(testData),
      },
      timeout: 5000,
    };

    console.error(`[Test] Sending request to ${hostname}:${port}/api/system/version`);

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.error(`[Test] Response status: ${res.statusCode}`);
        console.error(`[Test] Response headers:`, res.headers);
        console.error(`[Test] Response body: ${data.substring(0, 500)}`);

        try {
          const parsed = JSON.parse(data);
          console.error(`[Test] Parsed response:`, JSON.stringify(parsed, null, 2));
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Invalid JSON: ${e.message}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error(`[Test] Connection error:`, error.message);
      reject(error);
    });

    req.on('timeout', () => {
      console.error(`[Test] Connection timeout`);
      req.destroy();
      reject(new Error('Timeout'));
    });

    req.write(testData);
    req.end();
  });
}

// Run test
testConnection()
  .then(result => {
    console.error('[Test] SUCCESS: Connected to SiYuan API');
    console.error('[Test] Result:', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('[Test] FAILED:', error.message);
    process.exit(1);
  });
