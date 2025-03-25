import http from 'k6/http';
import { sleep, check, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Define custom metrics for better insights
const errorRate = new Rate('errors');
const requestDuration = new Trend('request_duration');
let baseURL = 'https://reqres.in';

// We create a realistic test environment with gradual load increases and decreases.
export const options = {
  //Here we apply gradual load increase and decrease.
  stages: [
    { duration: '30s', target: 1 }, // Ramp-up: Gradually increase to 10 virtual users
    { duration: '1m', target: 10 },  // Steady state: Maintain 10 VUs for 1 minute
    { duration: '30s', target: 0 },  // Ramp-down: Gradually decrease to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    errors: ['rate<0.1'],             // Total errors must be less than 10%.
  },
};

// Main scenario function - executed for each virtual user
export default function () {

  group('List Users', function () {
    let page = 2;
    // Send GET request and store the response
    const response = http.get(`${baseURL}/api/users?page=${page}`);
    const responseBody = JSON.parse(response.body);
    sleep(1);
    // Validate the response with checks
    check(response, {
      'Status is 200': (r) => r.status === 200,
      'Response time < 200ms': (r) => r.timings.duration < 200,
    });

    //Json Format Control
    check(response, {
      'response is a valid JSON': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch (e) {
          return false;
        }
      }
    });

    // Control of Response index

    check(responseBody, {
      'page number is correct': (data) => data.page === 2,
      'per_page value is correct': (data) => data.per_page === 6,
      'total count is present': (data) => data.total !== undefined,
      'total_pages count is present': (data) => data.total_pages !== undefined,
      'data array exists': (data) => Array.isArray(data.data),
      'data array has items': (data) => data.data.length > 0,
    });

    //Control of the user information
    check(responseBody, {
      'users have required fields': (data) => {
        return data.data.every(user =>
          user.id !== undefined &&
          user.email !== undefined &&
          user.first_name !== undefined &&
          user.last_name !== undefined &&
          user.avatar !== undefined
        );
      },

      'Michael Lawson exists': (data) => {
        return data.data.some(user =>
          user.id === 7 &&
          user.email === 'michael.lawson@reqres.in' &&
          user.first_name === 'Michael' &&
          user.last_name === 'Lawson' &&
          user.avatar === 'https://reqres.in/img/faces/7-image.jpg'

        );
      },

      'emails are in valid format': (data) => {
        const emailPattern = /@reqres\.in$/;
        return data.data.every(user =>
          emailPattern.test(user.email)
        );
      },

      'avatar URLs are valid': (data) => {
        return data.data.every(user =>
          user.avatar.startsWith('https://reqres.in/img/faces/') &&
          user.avatar.endsWith('-image.jpg')
        );
      },
    });
    // Record custom metrics for detailed analysis
    requestDuration.add(response.timings.duration);
    errorRate.add(response.status !== 200);
    // Pause between requests to simulate real user behavior
    sleep(1);
  });

  group('Single User', function () {
    const response = http.get(`${baseURL}/api/users/2`);
    const responseBody = JSON.parse(response.body);
    sleep(1);
    // Validate the response with checks
    check(response, {
      'Status is 200': (r) => r.status === 200,
      'Response time < 200ms': (r) => r.timings.duration < 200,
    });

    check(responseBody, {
      'Response Id Control': (data) => data.data.id === 2,
      'Response Email Control': (data) => data.data.email === 'janet.weaver@reqres.in',
      'First Name Control': (data) => data.data.first_name === 'Janet',
      'Last Name Control': (data) => data.data.last_name === 'Weaver',
      'Avatar Control': (data) => data.data.avatar === 'https://reqres.in/img/faces/2-image.jpg'
    });

    check(responseBody, {
      'Support URL is valid': (data) => data.support.url === 'https://contentcaddy.io?utm_source=reqres&utm_medium=json&utm_campaign=referral',
      'Text Control': (data) => data.support.text === 'Tired of writing endless social media content? Let Content Caddy generate it for you.'
    });

    // Record custom metrics for detailed analysis
    requestDuration.add(response.timings.duration);
    errorRate.add(response.status !== 200);
    // Pause between requests to simulate real user behavior
    sleep(1);
  });

  group('Single User is Not Found', function () {
    const response = http.get(`${baseURL}/api/users/23`);
    const responseBody = response.body ? JSON.parse(response.body) : {};

    sleep(1);
    // Validate the response with checks
    check(response, {
      'Status is 400': (r) => r.status === 404,
      'Response time < 200ms': (r) => r.timings.duration < 200,
    });

    check(responseBody, {
      'Empty Object Value Control': (data) => data === '{}',
      'Empty Object Value Control': (data) => Object.keys(data).length === 0,
    });
  });


  group('Unknown Request', function () {
    const response = http.get(`${baseURL}/api/unknown`);
    const responseBody = response.body ? JSON.parse(response.body) : {};

    sleep(1);
    check(response, {
      'Status is 200-Control': (r) => r.status === 200,
    });

    check(responseBody, {
      'Page=1 Control': (data) => data.page === 1,
      'Per_Page is 6 - Control': (data) => data.per_page === 6,
      'Total is 12 - Control': (data) => data.total === 12,
      'Total_Page is 2 - Control': (data) => data.total_pages === 2,
    });

    check(responseBody, {
      'users have required fields': (data) => {
        return data.data.every(data =>
          data.id !== undefined &&
          data.name !== undefined &&
          data.year !== undefined &&
          data.color !== undefined &&
          data.pantone_value !== undefined &&
          data.id > 0
        );
      }
    });

    check(responseBody, {
      'Empty Object Value Control': (data) => data === '{}',
      'Empty Object Value Control': (data) => Object.keys(data).length === 0,
    });
  })
}