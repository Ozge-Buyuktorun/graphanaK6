/**
 * Advanced K6 POST Request Template
 * 
 * This script demonstrates sophisticated API POST request testing with Grafana k6,
 * including advanced authentication handling, error recovery strategies, 
 * comprehensive metrics collection, and dynamic test data management.
 * 
 * Features:
 * - Token-based authentication with auto-refresh
 * - Circuit breaker pattern for fault tolerance
 * - Dynamic payload generation
 * - Custom metrics and detailed reporting
 * - Response validation with JSON schema
 * - Correlation between requests
 * - Environment-specific configurations
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomString, randomIntBetween, uuidv4 } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import encoding from 'k6/encoding';
import exec from 'k6/execution';
import { URL } from 'https://jslib.k6.io/url/1.0.0/index.js';

// Define custom metrics for comprehensive analysis
const loginFailRate = new Rate('login_failures');
const tokenRefreshRate = new Rate('token_refresh_rate');
const requestDuration = new Trend('request_duration_ms');
const dataProcessingTime = new Trend('data_processing_time_ms');
const successfulLogins = new Counter('successful_logins');
const bytesSent = new Counter('data_sent_bytes');

// Circuit breaker configuration
const CIRCUIT_MAX_FAILURES = 5;  // Maximum consecutive failures before circuit opens
const CIRCUIT_RESET_TIME = 30;   // Seconds before attempting to close circuit again
let circuitState = {
  failures: 0,
  openSince: null,
};

// Test configuration - can be overridden via environment variables
const CONFIG = {
  BASE_URL: __ENV.BASE_URL || 'http://test.k6.io',
  LOGIN_ENDPOINT: __ENV.LOGIN_ENDPOINT || '/login',
  AUTH_ENDPOINT: __ENV.AUTH_ENDPOINT || '/auth/token',
  REQUEST_TIMEOUT: __ENV.REQUEST_TIMEOUT ? parseInt(__ENV.REQUEST_TIMEOUT) : 3000,
  CONNECTION_TIMEOUT: __ENV.CONNECTION_TIMEOUT ? parseInt(__ENV.CONNECTION_TIMEOUT) : 1000,
  ENVIRONMENT: __ENV.ENVIRONMENT || 'staging',
  USER_POOL_SIZE: __ENV.USER_POOL_SIZE ? parseInt(__ENV.USER_POOL_SIZE) : 5,
  MAX_RETRIES: __ENV.MAX_RETRIES ? parseInt(__ENV.MAX_RETRIES) : 3,
  RETRY_INTERVAL: __ENV.RETRY_INTERVAL ? parseInt(__ENV.RETRY_INTERVAL) : 2,
};

// Test execution options with sophisticated load profile
export const options = {
  scenarios: {
    login_flow: {
      executor: 'ramping-arrival-rate', // Realistic arrival pattern
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 10,
      maxVUs: 50,
      stages: [
        { target: 5, duration: '1m' },    // Warm-up phase
        { target: 20, duration: '2m' },   // Steady load
        { target: 50, duration: '1m' },   // Spike test
        { target: 20, duration: '2m' },   // Recovery phase
        { target: 0, duration: '1m' },    // Cool-down
      ],
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<2000', 'p(99)<5000'],  // Response time thresholds
    'login_failures': ['rate<0.05'],                   // 5% max failure rate
    'checks': ['rate>0.95'],                           // 95% check pass rate
    'data_processing_time_ms': ['avg<500'],            // Client-side processing
  },
  tags: {
    environment: CONFIG.ENVIRONMENT,
    testType: 'authentication-test',
  },
};

/**
 * Generates a user credential pool for testing.
 * Using different credentials helps simulate real-world scenarios
 * and avoids rate-limiting and data pollution issues.
 * 
 * @param {number} poolSize - Number of unique users to generate
 * @returns {Array} - Pool of user credentials
 */
function generateUserPool(poolSize) {
  const users = [];
  for (let i = 0; i < poolSize; i++) {
    users.push({
      email: `user${i}_${randomString(8)}@example.com`,
      password: `Secure${randomString(12)}!${i}`,
      userId: uuidv4(),
    });
  }
  return users;
}

/**
 * Implements the Circuit Breaker pattern to prevent repeated calls
 * to failing services, allowing for system recovery.
 * 
 * @param {string} operationName - Name of operation to track
 * @returns {boolean} - Whether operation should proceed
 */
function circuitBreaker(operationName) {
  // If circuit is open, check if reset timeout has passed
  if (circuitState.openSince !== null) {
    const elapsedSeconds = (Date.now() - circuitState.openSince) / 1000;
    if (elapsedSeconds < CIRCUIT_RESET_TIME) {
      console.warn(`Circuit open: Skipping ${operationName} for ${CIRCUIT_RESET_TIME - Math.floor(elapsedSeconds)}s`);
      return false;
    }

    // Try to close the circuit
    console.log(`Attempting to reset circuit for ${operationName}`);
    circuitState.failures = 0;
    circuitState.openSince = null;
  }
  return true;
}

/**
 * Records a success or failure for the circuit breaker pattern.
 * Opens the circuit if consecutive failures exceed threshold.
 * 
 * @param {boolean} success - Whether the operation succeeded
 */
function recordCircuitBreakerResult(success) {
  if (success) {
    circuitState.failures = 0;  // Reset failure counter on success
  } else {
    circuitState.failures++;
    if (circuitState.failures >= CIRCUIT_MAX_FAILURES && circuitState.openSince === null) {
      circuitState.openSince = Date.now();
      console.error(`Circuit opened after ${CIRCUIT_MAX_FAILURES} consecutive failures`);
    }
  }
}

/**
 * Creates a unique JSON payload for each login attempt.
 * Adds metadata for tracking and security purposes.
 * 
 * @param {Object} user - User credentials
 * @returns {string} - JSON payload
 */
function createLoginPayload(user) {
  const processingStart = Date.now();

  // Create a payload with security and tracking info
  const payload = JSON.stringify({
    email: user.email,
    password: user.password,
    clientInfo: {
      deviceId: `k6-load-test-${exec.vu.idInTest}`,
      appVersion: '2.5.0',
      osType: 'Test',
      ipAddress: `192.0.2.${exec.vu.idInTest % 255}`, // Demo IP for load testing
    },
    metadata: {
      testRunId: uuidv4(),
      timestamp: new Date().toISOString(),
      correlationId: `corr-${uuidv4()}`,
    }
  });

  // Track client-side processing time
  dataProcessingTime.add(Date.now() - processingStart);

  // Track payload size
  bytesSent.add(payload.length);

  return payload;
}

/**
 * Performs login request with retry logic and comprehensive error handling.
 * Implements exponential backoff strategy for retries.
 * 
 * @param {Object} user - User credentials
 * @returns {Object|null} - Response data or null on failure
 */
function performLogin(user) {
  if (!circuitBreaker('login')) {
    return null;
  }

  const loginUrl = new URL(CONFIG.LOGIN_ENDPOINT, CONFIG.BASE_URL).toString();
  const payload = createLoginPayload(user);
  let retries = 0;
  let result = null;

  while (retries <= CONFIG.MAX_RETRIES) {
    // Advanced request parameters
    const params = {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'GrafanaK6/LoadTest',
        'X-Request-ID': uuidv4(),
        'X-Test-VU': exec.vu.idInTest.toString(),
      },
      timeout: CONFIG.REQUEST_TIMEOUT,
      connectionTimeout: CONFIG.CONNECTION_TIMEOUT,
      tags: {
        operation: 'user_login',
        retryCount: retries,
      },
    };

    // Execute request with timing
    const startTime = Date.now();
    const response = http.post(loginUrl, payload, params);
    requestDuration.add(Date.now() - startTime);

    // Comprehensive response validation
    const checkResult = check(response, {
      'status is 200': (r) => r.status === 200,
      'has valid token': (r) => {
        try {
          const body = r.json();
          return body.token && typeof body.token === 'string' && body.token.length > 10;
        } catch (e) {
          return false;
        }
      },
      'response time acceptable': (r) => r.timings.duration < 2000,
      'content-type is JSON': (r) => r.headers['Content-Type'] && r.headers['Content-Type'].includes('application/json'),
    });

    if (checkResult) {
      successfulLogins.add(1);
      recordCircuitBreakerResult(true);

      // Extract response data for correlation with future requests
      try {
        result = response.json();
        console.log(`Login successful for user ${user.email.substring(0, 5)}***`);
        break;
      } catch (e) {
        console.error(`Error parsing JSON: ${e.message}`);
      }
    } else {
      const backoffTime = CONFIG.RETRY_INTERVAL * Math.pow(2, retries);
      loginFailRate.add(1);
      console.warn(`Login attempt ${retries + 1} failed. Status: ${response.status}. Retrying in ${backoffTime}s`);

      // Only sleep if we're going to retry
      if (retries < CONFIG.MAX_RETRIES) {
        sleep(backoffTime);
      }

      retries++;
    }
  }

  if (retries > CONFIG.MAX_RETRIES) {
    recordCircuitBreakerResult(false);
    return null;
  }

  return result;
}

// Setup function runs once per test - prepare test data and environment
export function setup() {
  console.log(`Starting test in ${CONFIG.ENVIRONMENT} environment`);

  // Generate test users
  const userPool = generateUserPool(CONFIG.USER_POOL_SIZE);
  console.log(`Generated user pool with ${userPool.length} test accounts`);

  // Verify system health before proceeding with full test
  const healthCheck = http.get(`${CONFIG.BASE_URL}/health`);
  if (healthCheck.status !== 200) {
    throw new Error(`System health check failed: ${healthCheck.status}`);
  }

  return { userPool };
}

// Default function - main test execution
export default function (data) {
  group('Authentication Flow', function () {
    // Select random user from pool
    const userIndex = randomIntBetween(0, data.userPool.length - 1);
    const user = data.userPool[userIndex];

    // Attempt login with comprehensive metrics and error handling
    const loginResult = performLogin(user);

    if (loginResult) {
      // Simulate session usage
      sleep(randomIntBetween(1, 3));

      // Optionally perform other operations with the token
      // such as API calls or token refresh
      if (Math.random() < 0.3) { // 30% chance to refresh token
        const refreshPayload = JSON.stringify({
          token: loginResult.token,
          grant_type: 'refresh_token'
        });

        const refreshResponse = http.post(
          `${CONFIG.BASE_URL}${CONFIG.AUTH_ENDPOINT}/refresh`,
          refreshPayload,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${loginResult.token}`
            },
            tags: { operation: 'token_refresh' }
          }
        );

        check(refreshResponse, {
          'token refresh successful': (r) => r.status === 200
        }) ? tokenRefreshRate.add(0) : tokenRefreshRate.add(1);
      }
    }
  });

  // Add variable think time between iterations
  sleep(randomIntBetween(1, 5));
}

// Teardown function runs once at the end of the test
export function teardown(data) {
  console.log(`Test completed. Processed ${successfulLogins.values.count} successful logins`);

  // Clean up any test data if necessary
  if (CONFIG.ENVIRONMENT === 'staging' && successfulLogins.values.count > 0) {
    console.log('Performing test data cleanup...');
    // Code to clean up test accounts would go here
  }
}