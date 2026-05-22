#!/usr/bin/env node
/**
 * Load test using autocannon.
 * Run: pnpm test:load
 * Requires the dev/prod server to be running on port 3001.
 */

import autocannon from 'autocannon'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001'

const scenarios = [
  {
    title: 'Login page (EN)',
    url: `${BASE_URL}/en/login`,
  },
  {
    title: 'Login page (VI)',
    url: `${BASE_URL}/vi/login`,
  },
]

const DURATION = parseInt(process.env.LOAD_DURATION ?? '10', 10)
const CONNECTIONS = parseInt(process.env.LOAD_CONNECTIONS ?? '10', 10)
const PIPELINING = 1

function runScenario(scenario) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        title: scenario.title,
        url: scenario.url,
        connections: CONNECTIONS,
        duration: DURATION,
        pipelining: PIPELINING,
        headers: {
          accept: 'text/html,application/xhtml+xml',
        },
      },
      (err, result) => {
        if (err) return reject(err)
        resolve(result)
      },
    )

    autocannon.track(instance, { renderProgressBar: true })
  })
}

function printSummary(result) {
  const { title, requests, latency, throughput, errors, non2xx } = result

  const pass =
    latency.p99 < 2000 &&
    errors === 0 &&
    non2xx === 0 &&
    requests.average > 0

  const status = pass ? '✓ PASS' : '✗ FAIL'

  console.log(`\n${status}  ${title}`)
  console.log(`  Requests/sec  avg: ${requests.average.toFixed(1)}  p99: ${requests.p99}`)
  console.log(`  Latency (ms)  avg: ${latency.average.toFixed(1)}  p50: ${latency.p50}  p99: ${latency.p99}`)
  console.log(`  Throughput    avg: ${(throughput.average / 1024).toFixed(1)} KB/s`)
  console.log(`  Errors: ${errors}  Non-2xx: ${non2xx}`)

  return pass
}

console.log(`\nLoad test  →  ${BASE_URL}`)
console.log(`Settings: ${CONNECTIONS} connections · ${DURATION}s duration\n`)

let allPassed = true

for (const scenario of scenarios) {
  try {
    const result = await runScenario(scenario)
    const passed = printSummary(result)
    if (!passed) allPassed = false
  } catch (err) {
    console.error(`\n✗ FAIL  ${scenario.title}`)
    console.error(`  ${err.message}`)
    allPassed = false
  }
}

console.log(`\n${allPassed ? '✓ All scenarios passed' : '✗ Some scenarios failed'}\n`)
process.exit(allPassed ? 0 : 1)
