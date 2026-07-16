import { expect, test } from '@playwright/test'
import { browserPerformanceBudgets, type PerformanceFixtureId } from '@studio/editor'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const fixtures: Array<{ id: PerformanceFixtureId; width: number; height: number; objects: number; folders: number }> = [
  { id: '2k', width: 2560, height: 1440, objects: 12, folders: 0 },
  { id: '4k', width: 3840, height: 2160, objects: 24, folders: 0 },
  { id: '8k', width: 7680, height: 4320, objects: 48, folders: 0 },
  { id: 'deep-layers', width: 2560, height: 1440, objects: 512, folders: 32 },
  { id: 'high-depth', width: 4096, height: 2160, objects: 24, folders: 0 },
  { id: 'animation', width: 1920, height: 1080, objects: 120, folders: 12 },
]

for (const fixture of fixtures) {
  test(`records and enforces ${fixture.id} browser budgets`, async ({ page }, testInfo) => {
    const budget = browserPerformanceBudgets[fixture.id]
    test.setTimeout(budget.readyMs + budget.saveP95Ms + 45_000)
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () => ({
          createWritable: async () => ({
            write: async () => undefined,
            close: async () => { Object.defineProperty(window, '__studioBenchmarkSaved', { configurable: true, value: true }) },
            abort: async () => undefined,
          }),
        }),
      })
    })
    const startedAt = Date.now()
    await page.goto(`/app?benchmark=${fixture.id}`)
    const canvas = page.getByLabel('Composition canvas')
    await expect(canvas).toHaveAttribute('width', String(fixture.width))
    await expect(canvas).toHaveAttribute('height', String(fixture.height))
    await expect(canvas).toHaveAttribute('data-render-revision', /\d+/, { timeout: budget.readyMs })
    await expect(page.getByText(`${fixture.objects} objects · ${fixture.folders} folders`)).toBeVisible({ timeout: budget.readyMs })
    const readyMs = Date.now() - startedAt

    const warmupRevision = await canvas.getAttribute('data-render-revision')
    await page.getByRole('button', { name: 'New layer', exact: true }).click()
    await expect.poll(() => canvas.getAttribute('data-render-revision'), { timeout: budget.readyMs }).not.toBe(warmupRevision)
    await page.evaluate(() => window.__studioPerformance?.reset())
    const measuredRevision = await canvas.getAttribute('data-render-revision')
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => canvas.getAttribute('data-render-revision'), { timeout: budget.renderP95Ms * 2 }).not.toBe(measuredRevision)

    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    for (let index = 0; index < 24; index += 1) {
      await page.mouse.move(box!.x + (index % 6) * 8 + 4, box!.y + Math.floor(index / 6) * 8 + 4)
    }

    await page.keyboard.press('Control+s')
    await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __studioBenchmarkSaved?: boolean }).__studioBenchmarkSaved))).toBe(true)
    await expect.poll(async () => page.evaluate(() => window.__studioPerformance?.snapshot().durations.save.samples ?? 0)).toBeGreaterThan(0)

    if (fixture.id === '2k') {
      const download = page.waitForEvent('download')
      await page.getByRole('button', { name: 'File', exact: true }).click()
      await page.getByRole('menuitem', { name: 'PNG image', exact: true }).click()
      await download
      await expect.poll(async () => page.evaluate(() => window.__studioPerformance?.snapshot().durations.export.samples ?? 0)).toBeGreaterThan(0)
    }

    const snapshot = await page.evaluate(() => window.__studioPerformance?.snapshot())
    expect(snapshot).toBeDefined()
    expect(snapshot!.durations['pointer-latency'].samples).toBeGreaterThan(0)
    expect(snapshot!.durations.render.samples).toBeGreaterThan(0)
    expect(snapshot!.renderCount).toBeGreaterThan(0)
    expect(snapshot!.renderedFrames).toBeGreaterThan(0)
    expect(readyMs).toBeLessThanOrEqual(budget.readyMs)
    expect(snapshot!.durations.render.p95Ms).toBeLessThanOrEqual(budget.renderP95Ms)
    expect(snapshot!.durations['pointer-latency'].p95Ms).toBeLessThanOrEqual(budget.pointerP95Ms)
    expect(snapshot!.durations.save.p95Ms).toBeLessThanOrEqual(budget.saveP95Ms)
    const report = JSON.stringify({ fixture: fixture.id, readyMs, budget, snapshot }, null, 2)
    const reportDirectory = resolve('test-results/performance')
    await mkdir(reportDirectory, { recursive: true })
    await writeFile(resolve(reportDirectory, `${fixture.id}.json`), report)
    await testInfo.attach(`studio-performance-${fixture.id}.json`, {
      body: report,
      contentType: 'application/json',
    })
  })
}
