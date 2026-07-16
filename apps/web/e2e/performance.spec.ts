import { expect, test } from '@playwright/test'

test('records repeatable browser metrics against the 2K fixture', async ({ page }, testInfo) => {
  await page.goto('/app?benchmark=2k')
  const canvas = page.getByLabel('Composition canvas')
  await expect(canvas).toHaveAttribute('width', '2560')
  await expect(canvas).toHaveAttribute('height', '1440')
  await expect(canvas).toHaveAttribute('data-render-revision', /\d+/)
  await expect(page.getByText('12 objects · 0 folders')).toBeVisible()

  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  for (let index = 0; index < 24; index += 1) {
    await page.mouse.move(box!.x + (index % 6) * 8 + 4, box!.y + Math.floor(index / 6) * 8 + 4)
  }

  const download = page.waitForEvent('download')
  await page.keyboard.press('Control+s')
  await download
  await expect.poll(async () => page.evaluate(() => window.__studioPerformance?.snapshot().durations.save.samples ?? 0)).toBeGreaterThan(0)

  const snapshot = await page.evaluate(() => window.__studioPerformance?.snapshot())
  expect(snapshot).toBeDefined()
  expect(snapshot!.durations['pointer-latency'].samples).toBeGreaterThan(0)
  expect(snapshot!.durations.render.samples).toBeGreaterThan(0)
  expect(snapshot!.renderCount).toBeGreaterThan(0)
  expect(snapshot!.renderedFrames).toBeGreaterThan(0)
  await testInfo.attach('studio-performance-2k.json', { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' })
})
