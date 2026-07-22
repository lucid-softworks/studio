import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('exports and reopens PSD and PSB files through browser workers', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }))
  await page.goto('/app')
  await expect(page.getByLabel('Composition canvas')).toBeVisible()

  for (const format of [{ extension: 'psd', menuItem: 'Layered PSD', version: 1 }, { extension: 'psb', menuItem: 'Large document PSB', version: 2 }] as const) {
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'File', exact: true }).click()
    await page.getByRole('menuitem', { name: format.menuItem, exact: true }).click()
    const download = await downloadPromise
    const fileName = `worker-roundtrip.${format.extension}`
    const path = testInfo.outputPath(fileName)
    await download.saveAs(path)

    const header = await readFile(path)
    expect(header.subarray(0, 4).toString('ascii')).toBe('8BPS')
    expect(header.readUInt16BE(4)).toBe(format.version)

    await page.locator('input[type="file"]:not([accept])').setInputFiles({ name: fileName, mimeType: '', buffer: header })
    await expect(page.getByText(`Opened ${fileName} locally.`)).toBeVisible()
    await expect(page.getByText('1 object · 0 folders')).toBeVisible()
  }
})

test('cancels a layered PSD export without changing the document', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }))
  await page.goto('/app?benchmark=deep-layers')
  await expect(page.getByText('512 objects · 32 folders')).toBeVisible()

  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Layered PSD', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-studio-worker-job', 'PSD export')
  await page.keyboard.press('Escape')

  await expect(page.getByText('PSD export cancelled. The document was not changed.')).toBeVisible()
  await expect(page.getByText('512 objects · 32 folders')).toBeVisible()
})
