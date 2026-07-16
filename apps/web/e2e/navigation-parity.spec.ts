import { expect, test, type Locator, type Page } from '@playwright/test'

async function drag(page: Page, target: Locator, delta: { x: number; y: number }) {
  const bounds = await target.boundingBox()
  expect(bounds).not.toBeNull()
  const start = { x: bounds!.x + bounds!.width * 0.55, y: bounds!.y + bounds!.height * 0.55 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 6 })
  await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/app?benchmark=2k')
  await expect(page.getByLabel('Composition canvas')).toHaveAttribute('data-render-revision', /\d+/)
})

test('Space temporarily pans and modified Space temporarily zooms', async ({ page }) => {
  const brush = page.getByRole('button', { name: 'Brush tool', exact: true })
  const hand = page.getByRole('button', { name: 'Hand tool', exact: true })
  const zoom = page.getByRole('button', { name: 'Zoom tool', exact: true })
  await brush.click()
  for (let step = 0; step < 4; step += 1) await page.getByRole('button', { name: 'Zoom in', exact: true }).click()

  await page.keyboard.down('Space')
  await expect(hand).toHaveAttribute('aria-pressed', 'true')
  const stage = page.locator('.stage-grid')
  const before = await stage.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }))
  await drag(page, stage, { x: -120, y: -80 })
  const after = await stage.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }))
  expect(after.left).toBeGreaterThan(before.left)
  expect(after.top).toBeGreaterThan(before.top)
  await page.keyboard.up('Space')
  await expect(brush).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.down('Control')
  await page.keyboard.down('Space')
  await expect(zoom).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.up('Space')
  await page.keyboard.up('Control')
  await expect(brush).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.down('Alt')
  await page.keyboard.down('Space')
  await expect(zoom).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.up('Space')
  await page.keyboard.up('Alt')
  await expect(brush).toHaveAttribute('aria-pressed', 'true')
})

test('Zoom supports canvas clicks, Alt-clicks, scrubby dragging, menu commands, and shortcuts', async ({ page }) => {
  const zoomValue = page.getByTitle('Drag horizontally for scrubby zoom · click to reset')
  const readZoom = async () => Number((await zoomValue.textContent())?.replace('%', ''))
  await page.getByRole('button', { name: 'Zoom tool', exact: true }).click()
  const surface = page.getByLabel('zoom tool surface')

  const initial = await readZoom()
  await surface.click({ position: { x: 300, y: 220 } })
  expect(await readZoom()).toBeGreaterThan(initial)
  await surface.click({ position: { x: 300, y: 220 }, modifiers: ['Alt'] })
  expect(await readZoom()).toBe(initial)

  await drag(page, zoomValue, { x: 40, y: 0 })
  expect(await readZoom()).toBeGreaterThan(initial)

  await page.getByRole('button', { name: 'View', exact: true }).click()
  await page.getByRole('menuitem', { name: /100%/ }).click()
  expect(await readZoom()).toBe(100)
  await page.keyboard.press('Control+=')
  expect(await readZoom()).toBeGreaterThan(100)
  await page.keyboard.press('Control+0')
  expect(await readZoom()).toBe(100)
})

test('single-row and single-column marquees have exact geometry and modifier modes', async ({ page }) => {
  const documentSize = await page.getByLabel('Composition canvas').evaluate((canvas: HTMLCanvasElement) => ({ width: canvas.width, height: canvas.height }))
  const row = page.getByRole('button', { name: 'Single Row Marquee tool', exact: true })
  const column = page.getByRole('button', { name: 'Single Column Marquee tool', exact: true })
  await row.click()
  const rowSurface = page.getByLabel('Single row marquee surface', { exact: true })
  await rowSurface.click({ position: { x: 300, y: 210 } })
  await expect(rowSurface).toHaveAttribute('data-selection-width', String(documentSize.width))
  await expect(rowSurface).toHaveAttribute('data-selection-height', '1')

  await rowSurface.click({ position: { x: 300, y: 260 }, modifiers: ['Shift'] })
  await expect(rowSurface).toHaveAttribute('data-selection-width', String(documentSize.width))
  await expect(rowSurface).not.toHaveAttribute('data-selection-height', '1')

  await column.click()
  const columnSurface = page.getByLabel('Single column marquee surface', { exact: true })
  await columnSurface.click({ position: { x: 340, y: 210 } })
  await expect(columnSurface).toHaveAttribute('data-selection-width', '1')
  await expect(columnSurface).toHaveAttribute('data-selection-height', String(documentSize.height))
  await columnSurface.click({ position: { x: 340, y: 210 }, modifiers: ['Alt'] })
  await expect(page.getByRole('button', { name: 'Clear selection', exact: true })).toHaveCount(0)
})

test('Navigator renders large documents and drags the visible viewport', async ({ page }) => {
  await page.goto('/app?benchmark=8k')
  await expect(page.getByLabel('Composition canvas')).toHaveAttribute('data-render-revision', /\d+/)
  await page.getByRole('tab', { name: 'Nav', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: 'Navigator' })).toBeVisible()

  const preview = page.getByLabel('Document navigator preview')
  await expect.poll(() => preview.evaluate((canvas: HTMLCanvasElement) => ({ width: canvas.width, height: canvas.height }))).toMatchObject({ width: 360 })
  const previewHasPixels = await preview.evaluate((canvas: HTMLCanvasElement) => canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data.some((value) => value > 0))
  expect(previewHasPixels).toBe(true)

  await page.getByLabel('Navigator zoom').fill('200')
  const stage = page.locator('.stage-grid')
  await expect.poll(() => stage.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  const surface = page.getByLabel('Navigator pan surface')
  const bounds = await surface.boundingBox()
  expect(bounds).not.toBeNull()
  const before = await stage.evaluate((element) => element.scrollLeft)
  await page.mouse.move(bounds!.x + bounds!.width * 0.25, bounds!.y + bounds!.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(bounds!.x + bounds!.width * 0.75, bounds!.y + bounds!.height * 0.5, { steps: 6 })
  await page.mouse.up()
  const after = await stage.evaluate((element) => element.scrollLeft)
  expect(after).toBeGreaterThan(before)
  await expect(page.getByLabel('Navigator viewport')).not.toHaveAttribute('data-x', '0.0000')
})
