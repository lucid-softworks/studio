import { expect, test } from '@playwright/test'

test('blank documents start paint-ready and perspective painting follows the cursor', async ({ page }) => {
  await page.goto('/app')
  const canvas = page.getByLabel('Composition canvas')
  await expect(canvas).toBeVisible()
  await expect(page.getByText('1 object · 0 folders')).toBeVisible()
  await expect(page.getByRole('button', { name: /Layer 1 raster/i })).toBeVisible()

  await page.getByLabel('New document').click()
  await expect(page.getByText('1 object · 0 folders')).toBeVisible()
  await expect(page.getByRole('button', { name: /Layer 1 raster/i })).toBeVisible()

  const perspective = page.getByRole('slider', { name: 'Perspective horizontal', exact: true })
  await perspective.scrollIntoViewIfNeeded()
  await perspective.fill('80')
  await perspective.blur()

  await page.getByRole('button', { name: 'Brush tool', exact: true }).click()
  const brush = page.getByLabel('Brush surface')
  const bounds = await brush.boundingBox()
  expect(bounds).not.toBeNull()
  const ratio = { x: 0.28, y: 0.24 }
  const revision = await canvas.getAttribute('data-render-revision')
  await brush.click({ position: { x: bounds!.width * ratio.x, y: bounds!.height * ratio.y } })
  await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revision)

  const pixel = await canvas.evaluate((element: HTMLCanvasElement, position) => {
    const context = element.getContext('2d')!
    return [...context.getImageData(Math.round(element.width * position.x), Math.round(element.height * position.y), 1, 1).data]
  }, ratio)
  expect(pixel[3]).toBeGreaterThan(0)
})

test('utility panels remain stable with and without layers or history', async ({ page }) => {
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))

  await page.goto('/app')
  await expect(page.getByLabel('Composition canvas')).toBeVisible()

  const switchUtilityPanels = async () => {
    await page.getByRole('tab', { name: 'Chan', exact: true }).click()
    await expect(page.getByRole('tabpanel', { name: 'Channels' })).toBeVisible()
    await page.getByRole('tab', { name: 'History', exact: true }).click()
    await expect(page.getByRole('tabpanel', { name: 'History' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Document opened', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Act', exact: true }).click()
    await expect(page.getByRole('tabpanel', { name: 'Actions' })).toBeVisible()
    await page.getByRole('tab', { name: 'Layers', exact: true }).click()
  }

  await switchUtilityPanels()
  await page.getByRole('button', { name: 'Delete selected layer', exact: true }).click()
  await expect(page.getByText('0 objects · 0 folders')).toBeVisible()
  await expect(page.getByText('Blank document', { exact: true })).toBeVisible()
  await switchUtilityPanels()
  await switchUtilityPanels()

  await expect(page.getByText('Studio hit an unexpected error')).toHaveCount(0)
  expect(runtimeErrors).toEqual([])
})
