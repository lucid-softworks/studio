import { expect, test } from '@playwright/test'

test('exports and reopens a PSD through browser workers', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }))
  await page.goto('/app')
  await expect(page.getByLabel('Composition canvas')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Layered PSD', exact: true }).click()
  const download = await downloadPromise
  const path = testInfo.outputPath('worker-roundtrip.psd')
  await download.saveAs(path)

  await page.locator('input[type="file"]:not([accept])').setInputFiles(path)
  await expect(page.getByText('Opened worker-roundtrip.psd locally.')).toBeVisible()
  await expect(page.getByText('1 object · 0 folders')).toBeVisible()
})

test('cancels a layered PSD export without changing the document', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }))
  await page.goto('/app?benchmark=deep-layers')
  await expect(page.getByText('512 objects · 32 folders')).toBeVisible()

  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Layered PSD', exact: true }).click()
  await page.waitForTimeout(50)
  await page.keyboard.press('Escape')

  await expect(page.getByText('PSD export cancelled. The document was not changed.')).toBeVisible()
  await expect(page.getByText('512 objects · 32 folders')).toBeVisible()
})
