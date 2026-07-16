import { expect, test } from '@playwright/test'
import { browserPerformanceBudgets, type PerformanceFixtureId } from '@studio/editor'

for (const fixture of ['2k', '4k', '8k'] as PerformanceFixtureId[]) {
  test(`${fixture} gradient commit stays within its interaction budget`, async ({ page }) => {
    test.setTimeout(30_000)
    await page.goto(`/app?benchmark=${fixture}`)
    const canvas = page.getByLabel('Composition canvas')
    await expect(canvas).toHaveAttribute('data-render-revision', /\d+/)
    await page.getByRole('button', { name: 'New layer', exact: true }).click()
    await page.getByRole('button', { name: 'Gradient tool', exact: true }).click()
    const overlay = page.getByLabel('Gradient surface')
    const bounds = await overlay.boundingBox()
    expect(bounds).not.toBeNull()
    const revision = await canvas.getAttribute('data-render-revision')
    await page.mouse.move(bounds!.x + bounds!.width * 0.2, bounds!.y + bounds!.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(bounds!.x + bounds!.width * 0.8, bounds!.y + bounds!.height * 0.5, { steps: 8 })
    const startedAt = Date.now()
    await page.mouse.up()
    if (fixture === '8k') await expect(overlay.getByText(/Processing \d+%/)).toBeVisible()
    await expect(overlay).toHaveAttribute('aria-busy', 'false', { timeout: browserPerformanceBudgets[fixture].gradientCommitMs })
    await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revision)
    expect(Date.now() - startedAt).toBeLessThanOrEqual(browserPerformanceBudgets[fixture].gradientCommitMs)
  })
}
