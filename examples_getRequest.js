import http from 'k6/http';
import { sleep, check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics for better reporting
const errorRate = new Rate('errors');
const requestDuration = new Trend('request_duration');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'https://reqres.in';
const API_ENDPOINT = __ENV.API_ENDPOINT || '/api/users';
const SLEEP_DURATION = __ENV.SLEEP_DURATION ? parseFloat(__ENV.SLEEP_DURATION) : 1;

// Test options (can be overridden via command line)
export const options = {
  // Different stages of the test
  stages: [
    { duration: '30s', target: 5 },   // Ramp-up to 5 users
    { duration: '1m', target: 5 },    // Stay at 5 users for 1 minute
    { duration: '30s', target: 0 },   // Ramp-down to 0 users
  ],
  
  // Thresholds for test success criteria
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests must complete within 500ms
    'errors': ['rate<0.1'],            // Error rate must be less than 10%
  },
  
  // HTTP specific options
  httpDebug: __ENV.HTTP_DEBUG === 'true',
};

// Setup function - runs once at the beginning of the test
export function setup() {
  console.log(`Starting test with BASE_URL: ${BASE_URL}`);
  
  // You could perform authentication, gather test data, etc. here
  return {
    // Data to be passed to the default function
    testData: {
      pages: [1, 2, 3]
    }
  };
}

// Default function - this is the main test function that is executed for each VU
export default function(data) {
  // Get a random page number
  const page = data.testData.pages[randomIntBetween(0, data.testData.pages.length - 1)];
  
  // Prepare request parameters
  const url = `${BASE_URL}${API_ENDPOINT}?page=${page}`;
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'k6-load-test',
    },
    tags: {
      name: `GetUsersPage${page}`,  // Tag the request for better analysis
    },
  };
  
  // Execute the request
  const startTime = new Date().getTime();
  const response = http.get(url, params);
  const duration = new Date().getTime() - startTime;
  
  // Record the request duration
  requestDuration.add(duration);
  
  // Verify response
  const checkRes = check(response, {
    'is status 200': (r) => r.status === 200,
    'has valid JSON response': (r) => r.json().data !== undefined,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  // Update error rate metric based on check results
  errorRate.add(!checkRes);
  
  // Log failure details
  if (!checkRes) {
    console.error(`Request failed: ${url}, Status: ${response.status}, Body: ${response.body}`);
  }
  
  // Add dynamic sleep time to simulate real user behavior
  sleep(SLEEP_DURATION * randomIntBetween(8, 12) / 10);  // +/- 20% variation
}

// Teardown function - runs once at the end of the test
export function teardown(data) {
  console.log('Test completed');
  // Here you could clean up any resources created during the test
}