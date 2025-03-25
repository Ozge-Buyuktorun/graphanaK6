## How to Run
- ```k6 run firstTest.js```
## How to Run with Special Parameters.
### Set of VU (Virtual User) number
- ```k6 run --vus 20 firstTest.js```

### Set Test total duration as 3 minute.
- ```k6 run --duration 3m firstTest.js```

### Export the Test Result
- ```k6 run --out json=results.json firstTest.js```