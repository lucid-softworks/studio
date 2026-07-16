import { expect, test } from '@playwright/test'

test.describe('composition visual baselines', () => {
  test.use({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })

  for (const fixture of ['2k', 'high-depth'] as const) {
    for (const zoom of [100, 200] as const) {
      test(`${fixture} fixture at ${zoom}% zoom`, async ({ page }) => {
        await page.goto(`/app?benchmark=${fixture}`)
        const canvas = page.getByLabel('Composition canvas')
        await expect(canvas).toHaveAttribute('data-render-revision', /\d+/)

        for (let current = 100; current < zoom; current += 25) await page.getByRole('button', { name: 'Zoom in', exact: true }).click()

        await expect(canvas).toHaveScreenshot(`${fixture}-${zoom}.png`, {
          animations: 'disabled',
          maxDiffPixelRatio: 0.001,
        })
      })
    }
  }
})
