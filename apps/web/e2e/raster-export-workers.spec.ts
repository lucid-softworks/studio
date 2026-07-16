import { expect, test } from '@playwright/test'

test('encodes PDF and GIF exports in browser workers', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/app')
  await expect(page.getByLabel('Composition canvas')).toBeVisible()

  for (const [menuItem, fileName] of [['PDF', 'studio-composition.pdf'], ['Animated GIF from layers', 'studio-composition.gif']] as const) {
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'File', exact: true }).click()
    await page.getByRole('menuitem', { name: menuItem, exact: true }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(fileName)
  }
})
