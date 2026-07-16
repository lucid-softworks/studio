import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/app')
  await expect(page.getByLabel('Composition canvas')).toBeVisible()
})

test('Undo and Redo restore raster pixels through menu commands', async ({ page }) => {
  const canvas = page.getByLabel('Composition canvas')
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click()
  const brush = page.getByLabel('Brush surface')
  const bounds = await brush.boundingBox()
  expect(bounds).not.toBeNull()
  const ratio = { x: 0.42, y: 0.36 }
  await brush.click({ position: { x: bounds!.width * ratio.x, y: bounds!.height * ratio.y } })

  const alpha = () => canvas.evaluate((element: HTMLCanvasElement, position) => element.getContext('2d')!.getImageData(Math.round(element.width * position.x), Math.round(element.height * position.y), 1, 1).data[3], ratio)
  await expect.poll(alpha).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('menuitem', { name: /Undo/ }).click()
  await expect.poll(alpha).toBe(0)

  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('menuitem', { name: /Redo/ }).click()
  await expect.poll(alpha).toBeGreaterThan(0)
})

test('Select All and Deselect cover and clear the complete document', async ({ page }) => {
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await page.getByRole('menuitem', { name: /^All/ }).click()
  await page.getByRole('button', { name: 'Rectangular Marquee tool', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Clear selection', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await page.getByRole('menuitem', { name: /Deselect/i }).click()
  await expect(page.getByRole('button', { name: 'Clear selection', exact: true })).toHaveCount(0)
})

test('Inverse complements selection coverage through the menu and configurable shortcut', async ({ page }) => {
  await page.getByRole('button', { name: 'Rectangular Marquee tool', exact: true }).click()
  const surface = page.getByLabel('Rectangular selection surface').first()
  const bounds = await surface.boundingBox()
  expect(bounds).not.toBeNull()
  await page.mouse.move(bounds!.x + bounds!.width * 0.35, bounds!.y + bounds!.height * 0.35)
  await page.mouse.down()
  await page.mouse.move(bounds!.x + bounds!.width * 0.55, bounds!.y + bounds!.height * 0.55)
  await page.mouse.up()

  const alphaAt = (x: number, y: number) => surface.evaluate((canvas: HTMLCanvasElement, point) => {
    const pixelX = Math.floor(canvas.width * point.x)
    const pixelY = Math.floor(canvas.height * point.y)
    return canvas.getContext('2d')!.getImageData(pixelX, pixelY, 1, 1).data[3]
  }, { x, y })

  await expect.poll(() => alphaAt(0.45, 0.45)).toBeGreaterThan(0)
  await expect.poll(() => alphaAt(0.05, 0.05)).toBe(0)

  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await page.getByRole('menuitem', { name: /Inverse/ }).click()
  await expect.poll(() => alphaAt(0.45, 0.45)).toBe(0)
  await expect.poll(() => alphaAt(0.05, 0.05)).toBeGreaterThan(0)

  await page.keyboard.press('Control+Shift+i')
  await expect.poll(() => alphaAt(0.45, 0.45)).toBeGreaterThan(0)
  await expect.poll(() => alphaAt(0.05, 0.05)).toBe(0)
})
