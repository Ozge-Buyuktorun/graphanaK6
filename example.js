
    // Example 2: POST request with JSON payload
    group('Create User', function () {
      // Prepare the request payload as JSON
      const payload = JSON.stringify({
        name: 'Test User',
        email: `test-${Date.now()}@example.com`, // Dynamic email to avoid duplicates
        password: 'password123'
      });

      // Set request headers
      const params = {
        headers: {
          'Content-Type': 'application/json',
        },
      };

      // Send POST request with payload and headers
      const response = http.post('https://api.example.com/users', payload, params);

      // Validate the response
      check(response, {
        'User created': (r) => r.status === 201,
        'ID received': (r) => JSON.parse(r.body).id !== undefined,
      });

      sleep(2);
    });

    // Example 3: Authenticated request with Bearer token
    group('Authenticated GET Request', function () {
      // Set authorization header with Bearer token
      const params = {
        headers: {
          'Authorization': 'Bearer your-auth-token-here',
          'Content-Type': 'application/json',
        },
      };

      // Send authenticated GET request
      const response = http.get('https://api.example.com/user/profile', params);

      check(response, {
        'Profile loaded': (r) => r.status === 200,
      });

      sleep(1);
    });

    // Example 4: Batch requests for efficiency
    group('Multiple API Requests', function () {
      // Define multiple requests in an array
      const requests = [
        ['GET', 'https://api.example.com/products', null, { tags: { name: 'Products' } }],
        ['GET', 'https://api.example.com/categories', null, { tags: { name: 'Categories' } }],
      ];

      // Send all requests in a single batch
      const responses = http.batch(requests);

      // Check first response (Products)
      check(responses[0], {
        'Products loaded': (r) => r.status === 200,
        'Product count > 0': (r) => JSON.parse(r.body).length > 0,
      });

      // Check second response (Categories)
      check(responses[1], {
        'Categories loaded': (r) => r.status === 200,
      });

      sleep(2);
    });

    // Example 5: GraphQL API request
    group('GraphQL Query', function () {
      // Prepare GraphQL query
      const query = JSON.stringify({
        query: `
        query {
          products(first: 10) {
            id
            name
            price
          }
        }
      `
      });

      const params = {
        headers: {
          'Content-Type': 'application/json',
        },
      };

      // Send GraphQL query as POST request
      const response = http.post('https://api.example.com/graphql', query, params);

      // Validate GraphQL response
      check(response, {
        'GraphQL query successful': (r) => r.status === 200,
        'Data received': (r) => JSON.parse(r.body).data !== undefined,
        'No errors': (r) => JSON.parse(r.body).errors === undefined,
      });

      sleep(1);
    });



// Utility function for generating random strings
function randomString(length) {
  const charset = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let res = '';
  while (length--) res += charset[Math.floor(Math.random() * charset.length)];
  return res;
}

/** Setup function - runs once before the test starts
export function setup() {
  // Example: Obtain an auth token before test execution
  const loginRes = http.post('https://api.example.com/auth/login', {
    username: 'testuser',
    password: 'testpass',
  });

  const token = JSON.parse(loginRes.body).token;
  return { token }; // Return data to be used in the test
}*/

/* Teardown function - runs once after the test completes
export function teardown(data) {
  // Example: Clean up resources created during testing
  http.post('https://api.example.com/auth/logout', null, {
    headers: {
      'Authorization': `Bearer ${data.token}`
    }
  });
}
*/ 