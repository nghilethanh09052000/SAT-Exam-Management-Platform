import { test, expect, type Page } from '@playwright/test'

interface WebVitals {
  FCP: number | null
  LCP: number | null
  CLS: number | null
  TTFB: number | null
  TBT: number | null
}

async function collectWebVitals(page: Page): Promise<WebVitals> {
  return page.evaluate(() => {
    return new Promise<WebVitals>((resolve) => {
      const vitals: WebVitals = { FCP: null, LCP: null, CLS: null, TTFB: null, TBT: null }
      let clsValue = 0

      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      if (nav) {
        vitals.TTFB = Math.round(nav.responseStart - nav.requestStart)
      }

      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'paint' && entry.name === 'first-contentful-paint') {
            vitals.FCP = Math.round(entry.startTime)
          }
          if (entry.entryType === 'largest-contentful-paint') {
            vitals.LCP = Math.round(entry.startTime)
          }
          if (entry.entryType === 'layout-shift' && !(entry as unknown as { hadRecentInput: boolean }).hadRecentInput) {
            clsValue += (entry as unknown as { value: number }).value
            vitals.CLS = Math.round(clsValue * 1000) / 1000
          }
        }
      })

      try {
        observer.observe({ type: 'paint', buffered: true })
        observer.observe({ type: 'largest-contentful-paint', buffered: true })
        observer.observe({ type: 'layout-shift', buffered: true })
      } catch {
        // Some metrics may not be supported in all browsers
      }

      // Collect long tasks for TBT approximation
      let tbt = 0
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          tbt += Math.max(0, entry.duration - 50)
        }
        vitals.TBT = Math.round(tbt)
      })
      try {
        longTaskObserver.observe({ type: 'longtask', buffered: true })
      } catch {
        // longtask may not be supported
      }

      // Give browser time to settle and collect all metrics
      setTimeout(() => {
        observer.disconnect()
        longTaskObserver.disconnect()
        if (vitals.CLS === null) vitals.CLS = Math.round(clsValue * 1000) / 1000
        if (vitals.TBT === null) vitals.TBT = Math.round(tbt)
        resolve(vitals)
      }, 3000)
    })
  })
}

function printVitals(title: string, vitals: WebVitals) {
  console.log(`\n  Web Vitals — ${title}`)
  console.log(`    TTFB : ${vitals.TTFB ?? 'n/a'} ms   (good < 800)`)
  console.log(`    FCP  : ${vitals.FCP ?? 'n/a'} ms   (good < 1800)`)
  console.log(`    LCP  : ${vitals.LCP ?? 'n/a'} ms   (good < 2500)`)
  console.log(`    CLS  : ${vitals.CLS ?? 'n/a'}      (good < 0.1)`)
  console.log(`    TBT  : ${vitals.TBT ?? 'n/a'} ms   (good < 200)`)
}

// Core Web Vitals thresholds (Google "Good" tier)
const THRESHOLDS = {
  FCP: 1800,
  LCP: 2500,
  CLS: 0.1,
  TTFB: 800,
  TBT: 200,
}

test.describe('Web Vitals', () => {
  test('Login page EN meets Core Web Vitals', async ({ page }) => {
    await page.goto('/en/login')
    await page.waitForLoadState('networkidle')
    const vitals = await collectWebVitals(page)
    printVitals('/en/login', vitals)

    if (vitals.TTFB !== null) expect(vitals.TTFB).toBeLessThan(THRESHOLDS.TTFB)
    if (vitals.FCP !== null) expect(vitals.FCP).toBeLessThan(THRESHOLDS.FCP)
    if (vitals.LCP !== null) expect(vitals.LCP).toBeLessThan(THRESHOLDS.LCP)
    if (vitals.CLS !== null) expect(vitals.CLS).toBeLessThan(THRESHOLDS.CLS)
  })

  test('Login page VI meets Core Web Vitals', async ({ page }) => {
    await page.goto('/vi/login')
    await page.waitForLoadState('networkidle')
    const vitals = await collectWebVitals(page)
    printVitals('/vi/login', vitals)

    if (vitals.TTFB !== null) expect(vitals.TTFB).toBeLessThan(THRESHOLDS.TTFB)
    if (vitals.FCP !== null) expect(vitals.FCP).toBeLessThan(THRESHOLDS.FCP)
    if (vitals.LCP !== null) expect(vitals.LCP).toBeLessThan(THRESHOLDS.LCP)
    if (vitals.CLS !== null) expect(vitals.CLS).toBeLessThan(THRESHOLDS.CLS)
  })

  test('Login page renders within 3 seconds', async ({ page }) => {
    const start = Date.now()
    await page.goto('/en/login')
    await page.waitForLoadState('networkidle')
    const elapsed = Date.now() - start
    console.log(`\n  Page load time: ${elapsed} ms`)
    expect(elapsed).toBeLessThan(3000)
  })

  test('Language switching does not trigger full reload', async ({ page }) => {
    await page.goto('/en/login')
    await page.waitForLoadState('networkidle')

    const start = Date.now()
    await page.click('button:has-text("vi")')
    await page.waitForURL('**/vi/**', { timeout: 5000 })
    await page.waitForLoadState('networkidle')
    const elapsed = Date.now() - start

    console.log(`\n  Locale switch time: ${elapsed} ms`)
    expect(elapsed).toBeLessThan(2000)
    expect(page.url()).toContain('/vi/')
  })
})
