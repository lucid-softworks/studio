import { expect, test } from '@playwright/test'
import { browserPerformanceBudgets, type PerformanceFixtureId } from '@studio/editor'

for (const fixture of ['2k', '4k', '8k'] as PerformanceFixtureId[]) {
  test(`${fixture} gradient commit stays within its interaction budget`, async ({ page }) => {
    const budget = browserPerformanceBudgets[fixture]
    test.setTimeout(budget.readyMs + budget.gradientCommitMs + 20_000)
    await page.goto(`/app?benchmark=${fixture}`)
    const canvas = page.getByLabel('Composition canvas')
    await expect(canvas).toHaveAttribute('data-render-revision', /\d+/, { timeout: budget.readyMs })
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
    await expect(overlay).toHaveAttribute('aria-busy', 'false', { timeout: budget.gradientCommitMs })
    await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revision)
    expect(Date.now() - startedAt).toBeLessThanOrEqual(budget.gradientCommitMs)
  })
}
