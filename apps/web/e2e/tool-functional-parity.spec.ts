import { expect, test, type Locator, type Page } from '@playwright/test'

const expectedToolIds = [
  'move', 'marquee', 'ellipse-select', 'single-row-select', 'single-column-select', 'lasso', 'polygonal-lasso', 'magnetic-lasso', 'magic-wand', 'object-select',
  'crop', 'perspective-crop', 'eyedropper', 'measure', 'count', 'note', 'healing', 'clone-stamp', 'brush', 'pencil', 'color-replacement', 'mixer-brush', 'history-brush',
  'eraser', 'fill', 'gradient', 'dodge', 'burn', 'pattern-stamp', 'sponge', 'blur', 'sharpen', 'smudge', 'text', 'pen', 'direct-select', 'path-select',
  'warp', 'puppet-warp', 'rectangle', 'ellipse', 'hand', 'zoom',
] as const

async function openBlankEditor(page: Page) {
  await page.goto('/app')
  await expect(page.getByLabel('Composition canvas')).toBeVisible()
}

async function drag(page: Page, surface: Locator, from: [number, number], to: [number, number], modifiers: Array<'Shift' | 'Alt'> = []) {
  const bounds = await surface.boundingBox()
  expect(bounds).not.toBeNull()
  await page.mouse.move(bounds!.x + bounds!.width * from[0], bounds!.y + bounds!.height * from[1])
  await page.mouse.down()
  for (const modifier of modifiers) await page.keyboard.down(modifier)
  await page.mouse.move(bounds!.x + bounds!.width * to[0], bounds!.y + bounds!.height * to[1], { steps: 8 })
  await page.mouse.up()
  for (const modifier of [...modifiers].reverse()) await page.keyboard.up(modifier)
}

test('the functional browser inventory contains every built-in tool exactly once', async ({ page }) => {
  await openBlankEditor(page)
  const ids = await page.getByLabel('Tools').locator('[data-tool-id]').evaluateAll((tools) => tools.map((tool) => tool.getAttribute('data-tool-id')))
  expect(ids).toEqual(expectedToolIds)
})

test('every selection tool creates a real mask and rectangular modifiers change geometry', async ({ page }) => {
  await openBlankEditor(page)
  await page.getByRole('button', { name: 'New layer', exact: true }).click()
  await page.getByRole('button', { name: 'Paint Bucket tool', exact: true }).click()
  const fill = page.getByLabel('Paint bucket surface')
  await fill.click({ position: { x: 300, y: 220 } })
  await expect(fill).toHaveAttribute('aria-busy', 'false')

  for (const [label, surfaceName] of [
    ['Rectangular Marquee', 'Rectangular selection surface'],
    ['Elliptical Marquee', 'Elliptical selection surface'],
  ] as const) {
    await page.getByRole('button', { name: `${label} tool`, exact: true }).click()
    const surface = page.getByLabel(surfaceName, { exact: true }).first()
    await drag(page, surface, [0.5, 0.5], [0.62, 0.56], ['Shift', 'Alt'])
    await expect(page.getByRole('button', { name: 'Clear selection', exact: true })).toBeVisible()
    const selectedBounds = await surface.evaluate((canvas: HTMLCanvasElement) => {
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
      let left = canvas.width; let top = canvas.height; let right = -1; let bottom = -1
      for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) if (pixels.data[(y * canvas.width + x) * 4 + 3]) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y) }
      return { width: right - left + 1, height: bottom - top + 1, centerX: (left + right) / 2, centerY: (top + bottom) / 2 }
    })
    expect(Math.abs(selectedBounds.width - selectedBounds.height)).toBeLessThan(8)
    expect(selectedBounds.centerX).toBeCloseTo(800, -1)
    expect(selectedBounds.centerY).toBeCloseTo(500, -1)
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click()
  }

  for (const [label, surfaceName] of [
    ['Single Row Marquee', 'Single row marquee surface'],
    ['Single Column Marquee', 'Single column marquee surface'],
  ] as const) {
    await page.getByRole('button', { name: `${label} tool`, exact: true }).click()
    await page.getByLabel(surfaceName, { exact: true }).click({ position: { x: 320, y: 210 } })
    await expect(page.getByRole('button', { name: 'Clear selection', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click()
  }

  for (const [label, surfaceName] of [
    ['Lasso', 'Lasso selection surface'],
    ['Magnetic Lasso', 'Magnetic lasso selection surface'],
  ] as const) {
    await page.getByRole('button', { name: `${label} tool`, exact: true }).click()
    const surface = page.getByLabel(surfaceName, { exact: true })
    const bounds = await surface.boundingBox()
    expect(bounds).not.toBeNull()
    await page.mouse.move(bounds!.x + 250, bounds!.y + 180)
    await page.mouse.down()
    await page.mouse.move(bounds!.x + 430, bounds!.y + 190, { steps: 5 })
    await page.mouse.move(bounds!.x + 360, bounds!.y + 350, { steps: 5 })
    await page.mouse.move(bounds!.x + 250, bounds!.y + 180, { steps: 5 })
    await page.mouse.up()
    await expect(page.getByRole('button', { name: 'Clear selection', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click()
  }

  await page.getByRole('button', { name: 'Polygonal Lasso tool', exact: true }).click()
  const polygon = page.getByLabel('Polygonal lasso selection surface')
  await polygon.click({ position: { x: 260, y: 180 } })
  await polygon.click({ position: { x: 440, y: 200 } })
  await polygon.click({ position: { x: 360, y: 350 } })
  await polygon.dblclick({ position: { x: 260, y: 180 } })
  await expect(page.getByRole('button', { name: 'Clear selection', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click()

  for (const [label, surfaceName] of [['Magic Wand', 'Magic wand selection surface'], ['Object Select', 'Object selection surface']] as const) {
    await page.getByRole('button', { name: `${label} tool`, exact: true }).click()
    await page.getByLabel(surfaceName, { exact: true }).click({ position: { x: 320, y: 220 } })
    await expect(page.getByLabel(surfaceName, { exact: true })).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByRole('button', { name: 'Clear selection', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click()
  }
})

test('every direct paint tool changes raster pixels through a live canvas interaction', async ({ page }) => {
  await openBlankEditor(page)
  await page.getByRole('button', { name: 'New layer', exact: true }).click()
  const canvas = page.getByLabel('Composition canvas')
  const tools = [
    ['Brush', 'Brush surface'], ['Pencil', 'Pencil surface'], ['Eraser', 'Eraser surface'], ['Dodge', 'Dodge surface'], ['Burn', 'Burn surface'],
  ] as const
  for (let index = 0; index < tools.length; index += 1) {
    const [label, surfaceName] = tools[index]
    await page.getByRole('button', { name: `${label} tool`, exact: true }).click()
    const revision = await canvas.getAttribute('data-render-revision')
    await drag(page, page.getByLabel(surfaceName), [0.3, 0.38 + index * 0.04], [0.65, 0.42 + index * 0.04])
    await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revision)
  }
})

test('tone tools expose range, protection, sponge mode, vibrance, exposure, and flow controls', async ({ page }) => {
  await openBlankEditor(page)
  await page.getByRole('button', { name: 'Dodge tool', exact: true }).click()
  await expect(page.getByLabel('Tone range')).toHaveValue('midtones')
  await expect(page.getByLabel('Protect tones')).toBeChecked()
  await expect(page.getByLabel('Tool exposure')).toHaveValue('45')
  await expect(page.getByLabel('Tone tool flow')).toHaveValue('100')
  await page.getByLabel('Tone range').selectOption('highlights')

  await page.getByRole('button', { name: 'Burn tool', exact: true }).click()
  await expect(page.getByLabel('Tone range')).toHaveValue('highlights')
  await page.getByRole('button', { name: 'Sponge tool', exact: true }).click()
  await expect(page.getByLabel('Sponge mode')).toHaveValue('saturate')
  await expect(page.getByLabel('Sponge vibrance')).toBeChecked()
  await page.getByLabel('Sponge mode').selectOption('desaturate')
  await expect(page.getByLabel('Sponge mode')).toHaveValue('desaturate')
})

test('clone stamp keeps five transformed sources and previews the active source', async ({ page }) => {
  await openBlankEditor(page)
  await page.getByRole('button', { name: 'New layer', exact: true }).click()
  await page.getByRole('button', { name: 'Paint Bucket tool', exact: true }).click()
  const fill = page.getByLabel('Paint bucket surface')
  await fill.click({ position: { x: 280, y: 210 } })
  await expect(fill).toHaveAttribute('aria-busy', 'false')

  await page.getByRole('button', { name: 'Clone Stamp tool', exact: true }).click()
  const surface = page.getByLabel('Clone stamp surface')
  const bounds = await surface.boundingBox()
  expect(bounds).not.toBeNull()
  await page.keyboard.down('Alt')
  await page.mouse.click(bounds!.x + 280, bounds!.y + 210)
  await page.keyboard.up('Alt')

  await page.getByLabel('Clone source horizontal offset').fill('14')
  await page.getByLabel('Clone source vertical offset').fill('-8')
  await page.getByLabel('Clone source rotation').fill('25')
  await page.getByLabel('Clone source scale').fill('125')
  await page.getByLabel('Flip clone source horizontally').click()
  await page.getByLabel('Clone source 2').click()
  await expect(page.getByLabel('Clone source scale')).toBeDisabled()
  await page.keyboard.down('Alt')
  await page.mouse.click(bounds!.x + 420, bounds!.y + 250)
  await page.keyboard.up('Alt')
  await expect(page.getByLabel('Clone source scale')).toHaveValue('100')

  await page.getByLabel('Clone source 1').click()
  await expect(page.getByLabel('Clone source horizontal offset')).toHaveValue('14')
  await expect(page.getByLabel('Clone source rotation')).toHaveValue('25')
  await expect(page.getByLabel('Flip clone source horizontally')).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Clip clone source overlay').uncheck()
  await surface.hover({ position: { x: 400, y: 250 }, force: true })
  await expect(page.getByLabel('Clone source overlay', { exact: true })).toHaveAttribute('data-overlay-status', 'drawn')
  await expect.poll(() => page.getByLabel('Clone source overlay', { exact: true }).evaluate((canvas: HTMLCanvasElement) => canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0))).toBe(true)

  await page.getByLabel('Show clone source overlay').uncheck()
  await surface.hover({ position: { x: 420, y: 270 }, force: true })
  await expect.poll(() => page.getByLabel('Clone source overlay', { exact: true }).evaluate((canvas: HTMLCanvasElement) => canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data.every((value, index) => index % 4 !== 3 || value === 0))).toBe(true)
  const revision = await page.getByLabel('Composition canvas').getAttribute('data-render-revision')
  await drag(page, surface, [0.45, 0.45], [0.62, 0.55])
  await expect.poll(() => page.getByLabel('Composition canvas').getAttribute('data-render-revision')).not.toBe(revision)
})

test('action, crop, measure, hand, and zoom tools produce their canvas results', async ({ page }) => {
  await page.goto('/app?benchmark=2k')
  const canvas = page.getByLabel('Composition canvas')
  await expect(canvas).toHaveAttribute('data-render-revision', /\d+/)

  for (const label of ['Rectangle', 'Ellipse']) {
    const revision = await canvas.getAttribute('data-render-revision')
    await page.getByRole('button', { name: `${label} tool`, exact: true }).click()
    await page.getByLabel(`${label.toLowerCase()} tool surface`).click({ position: { x: 420, y: 260 } })
    await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revision)
  }

  const revisionBeforeText = await canvas.getAttribute('data-render-revision')
  await page.getByRole('button', { name: 'Type tool', exact: true }).click()
  const textSurface = page.getByLabel('text tool surface')
  await drag(page, textSurface, [0.35, 0.35], [0.55, 0.48])
  await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revisionBeforeText)

  await page.getByRole('button', { name: 'Eyedropper tool', exact: true }).click()
  const foreground = page.getByLabel('Foreground color').first()
  const colorBeforeSample = await foreground.inputValue()
  const sample = await canvas.evaluate((element: HTMLCanvasElement, current) => {
    const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data
    for (let y = 0; y < element.height; y += 8) for (let x = 0; x < element.width; x += 8) {
      const offset = (y * element.width + x) * 4
      const color = `#${[pixels[offset], pixels[offset + 1], pixels[offset + 2]].map((value) => value.toString(16).padStart(2, '0')).join('')}`
      if (pixels[offset + 3] && color !== current) return { x: x / element.width, y: y / element.height }
    }
    return null
  }, colorBeforeSample)
  expect(sample).not.toBeNull()
  const eyedropperSurface = page.getByLabel('eyedropper tool surface')
  const eyedropperBounds = await eyedropperSurface.boundingBox()
  expect(eyedropperBounds).not.toBeNull()
  await page.mouse.click(eyedropperBounds!.x + eyedropperBounds!.width * sample!.x, eyedropperBounds!.y + eyedropperBounds!.height * sample!.y)
  await expect(foreground).not.toHaveValue(colorBeforeSample)
  await page.keyboard.down('Shift')
  await page.mouse.click(eyedropperBounds!.x + eyedropperBounds!.width * sample!.x, eyedropperBounds!.y + eyedropperBounds!.height * sample!.y)
  await page.keyboard.up('Shift')
  await page.getByRole('button', { name: 'Samplers (1) · Shift-click to add', exact: true }).click()
  const samplerDialog = page.getByRole('dialog', { name: 'Color samplers' })
  await expect(samplerDialog).toBeVisible()
  await expect(samplerDialog.getByText('RGB', { exact: true })).toBeVisible()
  await expect(samplerDialog.getByText('HSL', { exact: true })).toBeVisible()
  await expect(samplerDialog.getByText('CMYK', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Measure / Straighten tool', exact: true }).click()
  const measure = page.getByLabel('Measure heading surface')
  await drag(page, measure, [0.3, 0.35], [0.62, 0.46], ['Shift'])
  await expect(page.getByText(/A (0|45)\.00°/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Clear', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save measurement', exact: true }).click()
  await page.getByRole('button', { name: 'Log (1)', exact: true }).click()
  const measurementLog = page.getByRole('dialog', { name: 'Measurement log' })
  await expect(measurementLog).toBeVisible()
  await measurementLog.getByLabel('Measurement pixels per unit').fill('10')
  await measurementLog.getByLabel('Measurement unit').fill('mm')
  await measurementLog.getByLabel('Measurement 1 name').fill('Scanned heading')
  const measurementDownload = page.waitForEvent('download')
  await measurementLog.getByRole('button', { name: 'Export CSV', exact: true }).click()
  expect((await measurementDownload).suggestedFilename()).toBe('studio-measurements.csv')
  await page.keyboard.press('Escape')
  await expect(measurementLog).toBeHidden()

  await page.getByRole('button', { name: 'Count tool', exact: true }).click()
  const countSurface = page.getByLabel('count tool surface')
  await countSurface.click({ position: { x: 310, y: 230 } })
  await countSurface.click({ position: { x: 420, y: 280 } })
  await page.getByRole('button', { name: 'Records (2)', exact: true }).click()
  const countLog = page.getByRole('dialog', { name: 'Count records' })
  await expect(countLog).toBeVisible()
  await countLog.getByLabel('Count group 1 name').fill('People')
  await countLog.getByLabel('Count marker 1 label').fill('Left guest')
  await countLog.getByRole('button', { name: 'New group', exact: true }).click()
  await expect(countLog.getByLabel('Count group 2 name')).toBeVisible()
  const countDownload = page.waitForEvent('download')
  await countLog.getByRole('button', { name: 'Export CSV', exact: true }).click()
  expect((await countDownload).suggestedFilename()).toBe('studio-counts.csv')
  await page.keyboard.press('Escape')
  await expect(countLog).toBeHidden()

  await page.getByRole('button', { name: 'Note tool', exact: true }).click()
  await page.getByLabel('note tool surface').click({ position: { x: 360, y: 250 } })
  const notesDialog = page.getByRole('dialog', { name: 'Notes and annotations' })
  await expect(notesDialog).toBeVisible()
  await notesDialog.getByLabel('Note 1 title').fill('Scan cleanup')
  await notesDialog.getByLabel('Note 1 content').fill('Remove the crease before export.')
  await notesDialog.getByLabel('Note 1 author').fill('Studio')
  await page.keyboard.press('Escape')
  await expect(notesDialog).toBeHidden()
  await expect(page.getByRole('button', { name: 'Notes (1) · click canvas to add', exact: true })).toBeVisible()

  const zoomText = page.getByTitle('Drag horizontally for scrubby zoom · click to reset')
  await page.getByRole('button', { name: 'Zoom tool', exact: true }).click()
  const zoomSurface = page.getByLabel('zoom tool surface')
  await zoomSurface.click({ position: { x: 400, y: 250 } })
  await expect(zoomText).not.toHaveText('100%')
  const zoomed = await zoomText.textContent()
  await zoomSurface.click({ position: { x: 400, y: 250 }, modifiers: ['Alt'] })
  await expect(zoomText).not.toHaveText(zoomed ?? '')

  await page.getByRole('button', { name: 'Hand tool', exact: true }).click()
  const stage = page.locator('.stage-grid')
  const stageBounds = await stage.boundingBox()
  expect(stageBounds).not.toBeNull()
  await page.mouse.move(stageBounds!.x + 300, stageBounds!.y + 260)
  await page.mouse.down()
  await page.mouse.move(stageBounds!.x + 220, stageBounds!.y + 190, { steps: 5 })
  await expect(stage).toHaveClass(/cursor-grabbing/)
  await page.mouse.up()

  await page.getByRole('button', { name: 'Crop tool', exact: true }).click()
  const crop = page.getByLabel('Rectangular selection surface').last()
  await drag(page, crop, [0.25, 0.25], [0.75, 0.75], ['Shift'])
  await expect(page.getByRole('button', { name: 'Apply crop', exact: true })).toBeEnabled()
  const revisionBeforeCrop = await canvas.getAttribute('data-render-revision')
  await page.getByRole('button', { name: 'Apply crop', exact: true }).click()
  await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revisionBeforeCrop)

  await page.getByRole('button', { name: 'Perspective Crop tool', exact: true }).click()
  const perspective = page.getByLabel('Perspective crop surface')
  const firstHandle = perspective.locator('circle').first()
  const handleBounds = await firstHandle.boundingBox()
  expect(handleBounds).not.toBeNull()
  await page.mouse.move(handleBounds!.x + handleBounds!.width / 2, handleBounds!.y + handleBounds!.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBounds!.x + 35, handleBounds!.y + 25, { steps: 4 })
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Rectify crop', exact: true })).toBeEnabled()
  const revisionBeforePerspective = await canvas.getAttribute('data-render-revision')
  await page.getByRole('button', { name: 'Rectify crop', exact: true }).click()
  await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revisionBeforePerspective)
})

test('move and path-selection modifiers commit reusable geometry', async ({ page }) => {
  await page.goto('/app?benchmark=2k')
  const canvas = page.getByLabel('Composition canvas')
  await expect(canvas).toHaveAttribute('data-render-revision', /\d+/)

  await page.getByRole('button', { name: 'Move tool', exact: true }).click()
  const transform = page.getByLabel('Transform overlay')
  const handles = transform.locator('rect[fill="#fafafa"]')
  await expect(handles).toHaveCount(8)
  const northWest = await handles.nth(0).boundingBox()
  const southEast = await handles.nth(4).boundingBox()
  expect(northWest).not.toBeNull()
  expect(southEast).not.toBeNull()
  const center = { x: (northWest!.x + southEast!.x + southEast!.width) / 2, y: (northWest!.y + southEast!.y + southEast!.height) / 2 }
  const revisionBeforeMove = await canvas.getAttribute('data-render-revision')
  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  await page.mouse.move(center.x + 45, center.y + 28, { steps: 6 })
  await page.mouse.up()
  await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revisionBeforeMove)

  const resizeHandle = transform.locator('rect[fill="#fafafa"]').nth(4)
  const resizeBounds = await resizeHandle.boundingBox()
  expect(resizeBounds).not.toBeNull()
  const revisionBeforeResize = await canvas.getAttribute('data-render-revision')
  await page.mouse.move(resizeBounds!.x + resizeBounds!.width / 2, resizeBounds!.y + resizeBounds!.height / 2)
  await page.mouse.down()
  await page.keyboard.down('Shift')
  await page.keyboard.down('Alt')
  await page.mouse.move(resizeBounds!.x + 55, resizeBounds!.y + 42, { steps: 6 })
  await page.mouse.up()
  await page.keyboard.up('Alt')
  await page.keyboard.up('Shift')
  await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revisionBeforeResize)

  await page.getByRole('button', { name: 'Pen tool', exact: true }).click()
  const pen = page.getByLabel('pen path editing surface')
  const penBounds = await pen.boundingBox()
  expect(penBounds).not.toBeNull()
  const penPoints = [[0.32, 0.32], [0.62, 0.35], [0.5, 0.66], [0.32, 0.32]] as const
  for (const [x, y] of penPoints) await page.mouse.click(penBounds!.x + penBounds!.width * x, penBounds!.y + penBounds!.height * y)

  await page.getByRole('button', { name: 'Path Selection tool', exact: true }).click()
  const pathSurface = page.getByLabel('path-select path editing surface')
  const path = pathSurface.locator('path').first()
  await expect(path).toBeVisible()
  const surfaceBounds = await pathSurface.boundingBox()
  const coordinates = (await path.getAttribute('d'))?.match(/-?\d+(?:\.\d+)?/g)?.map(Number)
  expect(surfaceBounds).not.toBeNull()
  expect(coordinates?.length).toBeGreaterThanOrEqual(4)
  const pathStart = {
    x: surfaceBounds!.x + ((coordinates![0] + coordinates![2]) / 2 / 2560) * surfaceBounds!.width,
    y: surfaceBounds!.y + ((coordinates![1] + coordinates![3]) / 2 / 1440) * surfaceBounds!.height,
  }
  const revisionBeforePathMove = await canvas.getAttribute('data-render-revision')
  await page.mouse.move(pathStart.x, pathStart.y)
  await page.mouse.down()
  await page.keyboard.down('Shift')
  await page.mouse.move(pathStart.x + 60, pathStart.y + 32, { steps: 6 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revisionBeforePathMove)
})
