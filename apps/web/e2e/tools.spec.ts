import { expect, test, type Locator, type Page } from '@playwright/test'

const shortcutTools = [
  ['v', 'Move'],
  ['m', 'Rectangular Marquee'],
  ['Shift+m', 'Elliptical Marquee'],
  ['l', 'Lasso'],
  ['Shift+l', 'Polygonal Lasso'],
  ['w', 'Magic Wand'],
  ['Shift+w', 'Object Select'],
  ['c', 'Crop'],
  ['Shift+c', 'Perspective Crop'],
  ['i', 'Eyedropper'],
  ['Shift+i', 'Measure / Straighten'],
  ['j', 'Healing Brush'],
  ['s', 'Clone Stamp'],
  ['b', 'Brush'],
  ['Shift+b', 'Pencil'],
  ['y', 'History Brush'],
  ['e', 'Eraser'],
  ['g', 'Paint Bucket'],
  ['Shift+g', 'Gradient'],
  ['o', 'Dodge'],
  ['Shift+o', 'Burn'],
  ['t', 'Type'],
  ['p', 'Pen'],
  ['a', 'Direct Selection'],
  ['Shift+a', 'Path Selection'],
  ['u', 'Rectangle'],
  ['Shift+u', 'Ellipse'],
  ['h', 'Hand'],
  ['z', 'Zoom'],
] as const

async function openBlankEditor(page: Page) {
  await page.goto('/app')
  await expect(page.getByLabel('Composition canvas')).toBeVisible()
  await expect(page.getByLabel('Tools')).toBeVisible()
}

test.describe('built-in tools', () => {
  test('every built-in tool activates through pointer input and modified pointer input', async ({ page }) => {
    const runtimeErrors: string[] = []
    page.on('pageerror', (error) => runtimeErrors.push(error.message))
    await openBlankEditor(page)

    const tools = page.getByLabel('Tools').getByRole('button')
    await expect(tools).toHaveCount(41)

    for (let index = 0; index < await tools.count(); index += 1) {
      const tool = tools.nth(index)
      await tool.scrollIntoViewIfNeeded()
      await tool.click()
      await expect(tool).toHaveAttribute('aria-pressed', 'true')

      for (const modifiers of [['Shift'], ['Alt'], ['Control'], ['Meta']] as const) {
        await tool.click({ modifiers: [...modifiers] })
        await expect(tool).toHaveAttribute('aria-pressed', 'true')
      }
    }

    expect(runtimeErrors).toEqual([])
  })

  test('every assigned tool shortcut activates its target', async ({ page }) => {
    await openBlankEditor(page)

    for (const [shortcut, label] of shortcutTools) {
      await page.keyboard.press(shortcut)
      await expect(page.getByRole('button', { name: `${label} tool`, exact: true })).toHaveAttribute('aria-pressed', 'true')
    }
  })

  test('selection modifier controls remain available across selection tools', async ({ page }) => {
    await openBlankEditor(page)
    const selectionTools = ['Rectangular Marquee', 'Elliptical Marquee', 'Lasso', 'Polygonal Lasso', 'Magnetic Lasso', 'Magic Wand', 'Object Select']

    for (const label of selectionTools) {
      await page.getByRole('button', { name: `${label} tool`, exact: true }).click()
      for (const mode of ['replace', 'add', 'subtract', 'intersect']) {
        const control = page.getByRole('button', { name: `${mode} selection`, exact: true })
        await expect(control).toBeVisible()
        await control.click()
        await expect(control).toHaveAttribute('aria-pressed', 'true')
      }
    }
  })

  test('pen and direct-selection drags preview locally and commit once on release', async ({ page }) => {
    await page.goto('/app?benchmark=2k')
    const canvas = page.getByLabel('Composition canvas')
    await expect(canvas).toHaveAttribute('data-render-revision', /\d+/)
    await page.getByRole('button', { name: 'Pen tool', exact: true }).click()
    const penSurface = page.getByLabel('pen path editing surface')
    const bounds = await penSurface.boundingBox()
    expect(bounds).not.toBeNull()

    const revisionBeforePen = await canvas.getAttribute('data-render-revision')
    await page.mouse.move(bounds!.x + 160, bounds!.y + 160)
    await page.mouse.down()
    await page.mouse.move(bounds!.x + 210, bounds!.y + 190, { steps: 12 })
    await page.waitForTimeout(50)
    await expect(canvas).toHaveAttribute('data-render-revision', revisionBeforePen!)
    await page.mouse.up()
    await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revisionBeforePen)

    await page.mouse.click(bounds!.x + 320, bounds!.y + 230)
    await page.mouse.click(bounds!.x + 420, bounds!.y + 150)
    await page.getByRole('button', { name: 'Direct Selection tool', exact: true }).click()
    const directSurface = page.getByLabel('direct-select path editing surface')
    const anchor = directSurface.locator('circle').nth(1)
    await expect(anchor).toBeVisible()
    const anchorBounds = await anchor.boundingBox()
    expect(anchorBounds).not.toBeNull()

    const revisionBeforeDirect = await canvas.getAttribute('data-render-revision')
    await page.mouse.move(anchorBounds!.x + anchorBounds!.width / 2, anchorBounds!.y + anchorBounds!.height / 2)
    await page.mouse.down()
    await page.mouse.move(anchorBounds!.x + 80, anchorBounds!.y + 45, { steps: 12 })
    await page.waitForTimeout(50)
    await expect(canvas).toHaveAttribute('data-render-revision', revisionBeforeDirect!)
    await page.mouse.up()
    await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revisionBeforeDirect)

    const shiftedAnchor = directSurface.locator('circle[fill="#38bdf8"]')
    const shiftedBounds = await shiftedAnchor.boundingBox()
    const shiftedY = await shiftedAnchor.getAttribute('cy')
    const revisionBeforeShift = await canvas.getAttribute('data-render-revision')
    await page.mouse.move(shiftedBounds!.x + shiftedBounds!.width / 2, shiftedBounds!.y + shiftedBounds!.height / 2)
    await page.mouse.down()
    await page.mouse.move(shiftedBounds!.x + 90, shiftedBounds!.y + 40, { steps: 8 })
    await page.keyboard.down('Shift')
    await page.mouse.move(shiftedBounds!.x + 110, shiftedBounds!.y + 55)
    await expect(shiftedAnchor).toHaveAttribute('cy', shiftedY!)
    await expect(canvas).toHaveAttribute('data-render-revision', revisionBeforeShift!)
    await page.mouse.up()
    await page.keyboard.up('Shift')
    await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revisionBeforeShift)

    const cancelAnchor = directSurface.locator('circle[fill="#38bdf8"]')
    const cancelBounds = await cancelAnchor.boundingBox()
    const revisionBeforeCancel = await canvas.getAttribute('data-render-revision')
    await page.mouse.move(cancelBounds!.x + cancelBounds!.width / 2, cancelBounds!.y + cancelBounds!.height / 2)
    await page.mouse.down()
    await page.mouse.move(cancelBounds!.x + 65, cancelBounds!.y + 35, { steps: 8 })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await page.waitForTimeout(100)
    await expect(canvas).toHaveAttribute('data-render-revision', revisionBeforeCancel!)

    const handlesBeforeConvert = await directSurface.locator('circle').count()
    await directSurface.locator('circle[fill="#38bdf8"]').click({ modifiers: ['Alt'] })
    const convertedAnchorX = await directSurface.locator('circle[fill="#38bdf8"]').getAttribute('cx')
    await expect(directSurface.locator('circle[stroke="#7dd3fc"]').first()).not.toHaveAttribute('cx', convertedAnchorX!)
    await directSurface.locator('circle[fill="#38bdf8"]').click({ modifiers: ['Alt'] })
    await expect(directSurface.locator('circle')).toHaveCount(handlesBeforeConvert)
    const collapsedAnchorX = await directSurface.locator('circle[fill="#38bdf8"]').getAttribute('cx')
    await expect(directSurface.locator('circle[stroke="#7dd3fc"]').first()).toHaveAttribute('cx', collapsedAnchorX!)
  })

  test('every anchor handle supports linked, unlinked, collapse, and expansion interactions', async ({ page }) => {
    await openBlankEditor(page)
    await page.getByRole('button', { name: 'Pen tool', exact: true }).click()
    const penSurface = page.getByLabel('pen path editing surface')
    const bounds = await penSurface.boundingBox()
    expect(bounds).not.toBeNull()
    for (const [x, y] of [[0.25, 0.3], [0.42, 0.22], [0.62, 0.38], [0.74, 0.62]]) {
      await page.mouse.move(bounds!.x + bounds!.width * x, bounds!.y + bounds!.height * y)
      await page.mouse.down()
      await page.mouse.move(bounds!.x + bounds!.width * x + 18, bounds!.y + bounds!.height * y + 10)
      await page.mouse.up()
    }

    await page.getByRole('button', { name: 'Direct Selection tool', exact: true }).click()
    const directSurface = page.getByLabel('direct-select path editing surface')
    const anchors = directSurface.locator('circle[stroke="#e0f2fe"]')
    await expect(anchors).toHaveCount(4)
    const point = async (locator: Locator) => ({ x: Number(await locator.getAttribute('cx')), y: Number(await locator.getAttribute('cy')) })
    const drag = async (locator: Locator, dx: number, dy: number, alt = false) => {
      const box = await locator.boundingBox()
      expect(box).not.toBeNull()
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
      await page.mouse.down()
      if (alt) await page.keyboard.down('Alt')
      await page.mouse.move(box!.x + box!.width / 2 + dx, box!.y + box!.height / 2 + dy, { steps: 4 })
      await page.mouse.up()
      if (alt) await page.keyboard.up('Alt')
    }

    for (let anchorIndex = 0; anchorIndex < 4; anchorIndex += 1) {
      await anchors.nth(anchorIndex).click()
      for (let handleIndex = 0; handleIndex < 2; handleIndex += 1) {
        const anchor = anchors.nth(anchorIndex)
        const handles = directSurface.locator('circle[stroke="#7dd3fc"]')
        const oppositeIndex = handleIndex === 0 ? 1 : 0
        const anchorPoint = await point(anchor)
        await drag(handles.nth(handleIndex), handleIndex === 0 ? -14 : 14, 9)
        const linked = [await point(handles.nth(0)), await point(handles.nth(1))]
        expect(linked[0].x + linked[1].x).toBeCloseTo(anchorPoint.x * 2, 4)
        expect(linked[0].y + linked[1].y).toBeCloseTo(anchorPoint.y * 2, 4)

        const oppositeBefore = await point(handles.nth(oppositeIndex))
        await drag(handles.nth(handleIndex), handleIndex === 0 ? -11 : 11, -7, true)
        const oppositeAfter = await point(handles.nth(oppositeIndex))
        expect(oppositeAfter.x).toBeCloseTo(oppositeBefore.x, 6)
        expect(oppositeAfter.y).toBeCloseTo(oppositeBefore.y, 6)

        await anchor.click({ modifiers: ['Alt'] })
        const collapsed = [await point(handles.nth(0)), await point(handles.nth(1))]
        expect(collapsed[0].x).toBeCloseTo(anchorPoint.x, 6)
        expect(collapsed[0].y).toBeCloseTo(anchorPoint.y, 6)
        expect(collapsed[1].x).toBeCloseTo(anchorPoint.x, 6)
        expect(collapsed[1].y).toBeCloseTo(anchorPoint.y, 6)
        await anchor.click({ modifiers: ['Alt'] })
        const expanded = [await point(handles.nth(0)), await point(handles.nth(1))]
        expect(Math.abs(expanded[0].x - expanded[1].x)).toBeGreaterThan(1)
      }
    }
  })

  test('warp and puppet-warp drags use pixel previews and commit once on release', async ({ page }) => {
    await page.goto('/app?benchmark=2k')
    const canvas = page.getByLabel('Composition canvas')
    await expect(canvas).toHaveAttribute('data-render-revision', /\d+/)
    await page.getByRole('button', { name: /Fixture layer 4/ }).click()

    await page.getByRole('button', { name: 'Warp tool', exact: true }).click()
    const warpSurface = page.getByLabel('warp editing surface')
    const warpHandle = warpSurface.locator('circle').nth(4)
    await expect(warpHandle).toBeVisible()
    const warpBounds = await warpHandle.boundingBox()
    expect(warpBounds).not.toBeNull()
    const warpPositionBeforeCancel = { x: await warpHandle.getAttribute('cx'), y: await warpHandle.getAttribute('cy') }
    const revisionBeforeWarpCancel = await canvas.getAttribute('data-render-revision')
    await page.mouse.move(warpBounds!.x + warpBounds!.width / 2, warpBounds!.y + warpBounds!.height / 2)
    await page.mouse.down()
    await page.keyboard.down('Shift')
    await page.mouse.move(warpBounds!.x + 75, warpBounds!.y + 50, { steps: 12 })
    await expect(page.locator('[data-warp-preview="warp"]')).toBeVisible()
    await expect(canvas).toHaveAttribute('data-render-revision', revisionBeforeWarpCancel!)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await page.keyboard.up('Shift')
    await expect(page.locator('[data-warp-preview="warp"]')).toBeHidden()
    await expect(warpHandle).toHaveAttribute('cx', warpPositionBeforeCancel.x!)
    await expect(warpHandle).toHaveAttribute('cy', warpPositionBeforeCancel.y!)

    const commitWarpHandle = warpSurface.locator('circle').nth(4)
    const commitWarpBounds = await commitWarpHandle.boundingBox()
    const revisionBeforeWarp = await canvas.getAttribute('data-render-revision')
    await page.mouse.move(commitWarpBounds!.x + commitWarpBounds!.width / 2, commitWarpBounds!.y + commitWarpBounds!.height / 2)
    await page.mouse.down()
    await page.mouse.move(commitWarpBounds!.x + 55, commitWarpBounds!.y + 35, { steps: 8 })
    await expect(page.locator('[data-warp-preview="warp"]')).toBeVisible()
    await expect(canvas).toHaveAttribute('data-render-revision', revisionBeforeWarp!)
    await page.mouse.up()
    await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revisionBeforeWarp)

    await page.getByRole('button', { name: 'Puppet Warp tool', exact: true }).click()
    const puppetSurface = page.getByLabel('puppet editing surface')
    const surfaceBounds = await puppetSurface.boundingBox()
    expect(surfaceBounds).not.toBeNull()
    await page.mouse.click(surfaceBounds!.x + surfaceBounds!.width * 0.56, surfaceBounds!.y + surfaceBounds!.height * 0.58)
    const puppetPin = puppetSurface.locator('circle').first()
    await expect(puppetPin).toBeVisible()
    const pinBounds = await puppetPin.boundingBox()
    expect(pinBounds).not.toBeNull()
    const revisionBeforePuppet = await canvas.getAttribute('data-render-revision')
    await page.mouse.move(pinBounds!.x + pinBounds!.width / 2, pinBounds!.y + pinBounds!.height / 2)
    await page.mouse.down()
    await page.mouse.move(pinBounds!.x + 70, pinBounds!.y + 40, { steps: 12 })
    await expect(page.locator('[data-warp-preview="puppet"]')).toBeVisible()
    await expect(canvas).toHaveAttribute('data-render-revision', revisionBeforePuppet!)
    await page.mouse.up()
    await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revisionBeforePuppet)

    const pinsBeforeDelete = await puppetSurface.locator('circle').count()
    await page.keyboard.press('Delete')
    await expect(puppetSurface.locator('circle')).toHaveCount(pinsBeforeDelete - 1)
  })

  test('every warp grid point preserves dominant-axis constraints and commits on release', async ({ page }) => {
    await page.goto('/app?benchmark=2k')
    const canvas = page.getByLabel('Composition canvas')
    await expect(canvas).toHaveAttribute('data-render-revision', /\d+/)
    await page.getByRole('button', { name: /Fixture layer 4/ }).click()
    await page.getByRole('slider', { name: 'Rotation', exact: true }).fill('0')
    await page.getByRole('button', { name: 'Warp tool', exact: true }).click()
    const warpSurface = page.getByLabel('warp editing surface')
    await expect(warpSurface.locator('circle')).toHaveCount(9)

    for (let index = 0; index < 9; index += 1) {
      const handle = warpSurface.locator('circle').nth(index)
      const handleBounds = await handle.boundingBox()
      expect(handleBounds).not.toBeNull()
      const yBefore = Number(await handle.getAttribute('cy'))
      const revisionBefore = await canvas.getAttribute('data-render-revision')
      await page.mouse.move(handleBounds!.x + handleBounds!.width / 2, handleBounds!.y + handleBounds!.height / 2)
      await page.mouse.down()
      await page.keyboard.down('Shift')
      await page.mouse.move(handleBounds!.x + 30, handleBounds!.y + 8, { steps: 4 })
      await expect(page.locator('[data-warp-preview="warp"]')).toBeVisible()
      expect(Number(await handle.getAttribute('cy'))).toBeCloseTo(yBefore, 2)
      await expect(canvas).toHaveAttribute('data-render-revision', revisionBefore!)
      await page.mouse.up()
      await page.keyboard.up('Shift')
      await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revisionBefore)
    }
  })

  test('clone and retouch strokes stay live with tiled undo snapshots', async ({ page }) => {
    const runtimeErrors: string[] = []
    page.on('pageerror', (error) => runtimeErrors.push(error.message))
    await openBlankEditor(page)
    await page.getByRole('button', { name: 'New layer', exact: true }).click()
    await page.getByRole('button', { name: 'Brush tool', exact: true }).click()
    const brush = page.getByLabel('Brush surface')
    const bounds = await brush.boundingBox()
    expect(bounds).not.toBeNull()
    await page.mouse.move(bounds!.x + bounds!.width * 0.28, bounds!.y + bounds!.height * 0.42)
    await page.mouse.down()
    await page.mouse.move(bounds!.x + bounds!.width * 0.42, bounds!.y + bounds!.height * 0.48, { steps: 12 })
    await page.mouse.up()

    const canvas = page.getByLabel('Composition canvas')
    await page.getByRole('button', { name: 'Clone Stamp tool', exact: true }).click()
    const clone = page.getByLabel('Clone stamp surface')
    await clone.click({ position: { x: bounds!.width * 0.35, y: bounds!.height * 0.45 }, modifiers: ['Alt'] })
    const revisionBeforeClone = await canvas.getAttribute('data-render-revision')
    await page.mouse.move(bounds!.x + bounds!.width * 0.58, bounds!.y + bounds!.height * 0.58)
    await page.mouse.down()
    await page.mouse.move(bounds!.x + bounds!.width * 0.7, bounds!.y + bounds!.height * 0.62, { steps: 12 })
    await expect(canvas).toHaveAttribute('data-render-revision', revisionBeforeClone!)
    await page.mouse.up()
    await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revisionBeforeClone)

    await page.getByRole('button', { name: 'Blur tool', exact: true }).click()
    const blur = page.getByLabel('blur surface')
    const revisionBeforeBlur = await canvas.getAttribute('data-render-revision')
    await blur.hover({ position: { x: bounds!.width * 0.6, y: bounds!.height * 0.58 } })
    await page.mouse.down()
    await page.mouse.move(bounds!.x + bounds!.width * 0.68, bounds!.y + bounds!.height * 0.6, { steps: 12 })
    await expect(canvas).toHaveAttribute('data-render-revision', revisionBeforeBlur!)
    await page.mouse.up()
    await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revisionBeforeBlur)
    expect(runtimeErrors).toEqual([])
  })

  test('every pixel-retouch mode commits tiled edits on a rotated masked target', async ({ page }) => {
    const runtimeErrors: string[] = []
    page.on('pageerror', (error) => runtimeErrors.push(error.message))
    await openBlankEditor(page)
    await page.getByRole('button', { name: 'New layer', exact: true }).click()
    await page.getByRole('button', { name: 'Brush tool', exact: true }).click()
    const brush = page.getByLabel('Brush surface')
    const bounds = await brush.boundingBox()
    expect(bounds).not.toBeNull()
    await page.mouse.move(bounds!.x + bounds!.width * 0.32, bounds!.y + bounds!.height * 0.4)
    await page.mouse.down()
    await page.mouse.move(bounds!.x + bounds!.width * 0.68, bounds!.y + bounds!.height * 0.62, { steps: 18 })
    await page.mouse.up()
    await page.getByRole('slider', { name: 'Rotation', exact: true }).fill('12')
    await page.getByRole('button', { name: '+ Vector mask', exact: true }).click()

    const canvas = page.getByLabel('Composition canvas')
    const modes = [
      ['Color Replacement', 'color-replacement'],
      ['Mixer Brush', 'mixer-brush'],
      ['History Brush', 'history-brush'],
      ['Pattern Stamp', 'pattern-stamp'],
      ['Sponge', 'sponge'],
      ['Blur', 'blur'],
      ['Sharpen', 'sharpen'],
      ['Smudge', 'smudge'],
    ] as const
    for (let index = 0; index < modes.length; index += 1) {
      const [label, mode] = modes[index]
      await page.getByRole('button', { name: `${label} tool`, exact: true }).click()
      const overlay = page.getByLabel(`${mode} surface`)
      const revisionBefore = await canvas.getAttribute('data-render-revision')
      const y = bounds!.y + bounds!.height * (0.43 + index * 0.018)
      await page.mouse.move(bounds!.x + bounds!.width * 0.4, y)
      await page.mouse.down()
      await page.mouse.move(bounds!.x + bounds!.width * 0.6, y + 12, { steps: 8 })
      await expect(overlay).toBeVisible()
      await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revisionBefore)
      await page.mouse.up()
    }
    expect(runtimeErrors).toEqual([])
  })

  test('clone and heal sample Current & Below through raster masks and warp geometry', async ({ page }) => {
    const runtimeErrors: string[] = []
    page.on('pageerror', (error) => runtimeErrors.push(error.message))
    await openBlankEditor(page)
    await page.getByRole('button', { name: 'New layer', exact: true }).click()
    await page.getByRole('button', { name: 'Brush tool', exact: true }).click()
    const brush = page.getByLabel('Brush surface')
    const bounds = await brush.boundingBox()
    expect(bounds).not.toBeNull()
    await page.mouse.move(bounds!.x + bounds!.width * 0.25, bounds!.y + bounds!.height * 0.38)
    await page.mouse.down()
    await page.mouse.move(bounds!.x + bounds!.width * 0.48, bounds!.y + bounds!.height * 0.52, { steps: 16 })
    await page.mouse.up()

    await page.getByRole('button', { name: '+ Mask', exact: true }).click()
    await page.getByRole('button', { name: 'Pixels', exact: true }).click()
    await page.getByRole('button', { name: 'Warp tool', exact: true }).click()
    const warp = page.getByLabel('warp editing surface')
    const center = warp.locator('circle').nth(4)
    const centerBounds = await center.boundingBox()
    expect(centerBounds).not.toBeNull()
    await page.mouse.move(centerBounds!.x + centerBounds!.width / 2, centerBounds!.y + centerBounds!.height / 2)
    await page.mouse.down()
    await page.mouse.move(centerBounds!.x + 38, centerBounds!.y + 24, { steps: 6 })
    await page.mouse.up()

    const canvas = page.getByLabel('Composition canvas')
    for (const [label, surfaceLabel] of [['Clone Stamp', 'Clone stamp'], ['Healing Brush', 'Healing brush']] as const) {
      await page.getByRole('button', { name: `${label} tool`, exact: true }).click()
      const overlay = page.getByLabel(`${surfaceLabel} surface`)
      await overlay.click({ position: { x: bounds!.width * 0.36, y: bounds!.height * 0.46 }, modifiers: ['Alt'] })
      const revisionBefore = await canvas.getAttribute('data-render-revision')
      await page.mouse.move(bounds!.x + bounds!.width * 0.58, bounds!.y + bounds!.height * 0.56)
      await page.mouse.down()
      await page.mouse.move(bounds!.x + bounds!.width * 0.7, bounds!.y + bounds!.height * 0.62, { steps: 8 })
      await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revisionBefore)
      await page.mouse.up()
    }
    expect(runtimeErrors).toEqual([])
  })

  test('paint bucket and contiguous selections complete through cancellable workers', async ({ page }) => {
    const runtimeErrors: string[] = []
    page.on('pageerror', (error) => runtimeErrors.push(error.message))
    await openBlankEditor(page)
    await page.getByRole('button', { name: 'New layer', exact: true }).click()
    const canvas = page.getByLabel('Composition canvas')

    await page.getByRole('button', { name: 'Paint Bucket tool', exact: true }).click()
    const fill = page.getByLabel('Paint bucket surface')
    const bounds = await fill.boundingBox()
    expect(bounds).not.toBeNull()
    const revisionBeforeFill = await canvas.getAttribute('data-render-revision')
    await fill.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } })
    await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revisionBeforeFill)
    await expect(fill).toHaveAttribute('aria-busy', 'false')

    await page.getByRole('button', { name: 'Magic Wand tool', exact: true }).click()
    const wand = page.getByLabel('Magic wand selection surface')
    await wand.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } })
    await expect(page.getByRole('button', { name: 'Clear selection', exact: true })).toBeVisible()
    await expect(wand).toHaveAttribute('aria-busy', 'false')
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click()

    await page.getByRole('button', { name: 'Object Select tool', exact: true }).click()
    const objectSelect = page.getByLabel('Object selection surface')
    await objectSelect.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } })
    await expect(page.getByRole('button', { name: 'Clear selection', exact: true })).toBeVisible()
    await expect(objectSelect).toHaveAttribute('aria-busy', 'false')
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click()

    await page.getByRole('button', { name: 'Rectangular Marquee tool', exact: true }).click()
    const marquee = page.getByLabel('Rectangular selection surface')
    await page.mouse.move(bounds!.x + bounds!.width * 0.35, bounds!.y + bounds!.height * 0.3)
    await page.mouse.down()
    await page.mouse.move(bounds!.x + bounds!.width * 0.65, bounds!.y + bounds!.height * 0.7)
    await page.mouse.up()
    const outsideBefore = await canvas.evaluate((element: HTMLCanvasElement) => [...element.getContext('2d')!.getImageData(100, 500, 1, 1).data])

    await page.getByRole('button', { name: 'Gradient tool', exact: true }).click()
    const gradient = page.getByLabel('Gradient surface')
    await page.waitForTimeout(150)
    const revisionBeforeGradient = await canvas.getAttribute('data-render-revision')
    await page.mouse.move(bounds!.x + bounds!.width * 0.25, bounds!.y + bounds!.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(bounds!.x + bounds!.width * 0.75, bounds!.y + bounds!.height * 0.5, { steps: 8 })
    await page.mouse.up()
    await expect.poll(() => canvas.getAttribute('data-render-revision')).not.toBe(revisionBeforeGradient)
    await expect(gradient).toHaveAttribute('aria-busy', 'false')
    const pixelsAfter = await canvas.evaluate((element: HTMLCanvasElement) => ({
      outside: [...element.getContext('2d')!.getImageData(100, 500, 1, 1).data],
      inside: [...element.getContext('2d')!.getImageData(800, 500, 1, 1).data],
    }))
    expect(pixelsAfter.outside).toEqual(outsideBefore)
    expect(pixelsAfter.inside).not.toEqual(outsideBefore)
    expect(runtimeErrors).toEqual([])
  })

  test('Escape discards pending raster worker results without changing pixels', async ({ page }) => {
    await page.addInitScript(() => {
      const NativeWorker = window.Worker
      let terminations = 0
      let deliveredFinals = 0
      class DelayedRasterWorker extends EventTarget {
        readonly inner: Worker
        readonly delayed: boolean
        readonly timers = new Set<number>()
        onmessage: ((event: MessageEvent) => void) | null = null
        onerror: ((event: ErrorEvent) => void) | null = null
        onmessageerror: ((event: MessageEvent) => void) | null = null
        active = true

        constructor(url: string | URL, options?: WorkerOptions) {
          super()
          this.delayed = String(url).includes('raster-ops.worker')
          this.inner = new NativeWorker(url, options)
          this.inner.addEventListener('message', (event) => {
            const deliver = () => {
              if (!this.active) return
              if (this.delayed && !(event.data && typeof event.data === 'object' && 'progress' in event.data)) deliveredFinals += 1
              this.onmessage?.(event)
              this.dispatchEvent(new MessageEvent('message', { data: event.data }))
            }
            if (this.delayed && !(event.data && typeof event.data === 'object' && 'progress' in event.data)) {
              const timer = window.setTimeout(() => { this.timers.delete(timer); deliver() }, 300)
              this.timers.add(timer)
            } else deliver()
          })
          this.inner.addEventListener('error', (event) => { this.onerror?.(event); this.dispatchEvent(event) })
          this.inner.addEventListener('messageerror', (event) => { this.onmessageerror?.(event); this.dispatchEvent(event) })
        }

        postMessage(message: unknown, transfer?: Transferable[]) { this.inner.postMessage(message, transfer ?? []) }
        terminate() {
          if (!this.active) return
          this.active = false
          if (this.delayed) terminations += 1
          for (const timer of this.timers) window.clearTimeout(timer)
          this.timers.clear()
          this.inner.terminate()
        }
      }
      Object.defineProperty(window, 'Worker', { configurable: true, value: DelayedRasterWorker })
      Object.defineProperty(window, '__studioRasterCancellationTest', {
        configurable: true,
        value: () => ({ terminations, deliveredFinals }),
      })
    })
    await openBlankEditor(page)
    await page.getByRole('button', { name: 'New layer', exact: true }).click()
    const canvas = page.getByLabel('Composition canvas')
    const pixel = () => canvas.evaluate((element: HTMLCanvasElement) => [...element.getContext('2d')!.getImageData(800, 500, 1, 1).data])
    const before = await pixel()

    await page.getByRole('button', { name: 'Paint Bucket tool', exact: true }).click()
    const fill = page.getByLabel('Paint bucket surface')
    const bounds = await fill.boundingBox()
    expect(bounds).not.toBeNull()
    await fill.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } })
    await expect(fill).toHaveAttribute('aria-busy', 'true')
    await page.keyboard.press('Escape')
    await expect(fill).toHaveAttribute('aria-busy', 'false')

    for (const [tool, surface] of [['Magic Wand', 'Magic wand'], ['Object Select', 'Object']] as const) {
      await page.getByRole('button', { name: `${tool} tool`, exact: true }).click()
      const overlay = page.getByLabel(`${surface} selection surface`)
      await overlay.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } })
      await expect(overlay).toHaveAttribute('aria-busy', 'true')
      await page.keyboard.press('Escape')
      await expect(overlay).toHaveAttribute('aria-busy', 'false')
    }

    await page.getByRole('button', { name: 'Gradient tool', exact: true }).click()
    const gradient = page.getByLabel('Gradient surface')
    await page.mouse.move(bounds!.x + bounds!.width * 0.25, bounds!.y + bounds!.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(bounds!.x + bounds!.width * 0.75, bounds!.y + bounds!.height * 0.5)
    await page.mouse.up()
    await expect(gradient).toHaveAttribute('aria-busy', 'true')
    await page.keyboard.press('Escape')
    await expect(gradient).toHaveAttribute('aria-busy', 'false')
    await page.waitForTimeout(350)

    expect(await pixel()).toEqual(before)
    expect(await page.evaluate(() => (window as unknown as { __studioRasterCancellationTest(): { terminations: number; deliveredFinals: number } }).__studioRasterCancellationTest())).toEqual({ terminations: 4, deliveredFinals: 0 })
  })

  test('Escape cancels content-aware jobs before they can mutate the document', async ({ page }) => {
    await page.addInitScript(() => {
      const NativeWorker = window.Worker
      let terminations = 0
      class DelayedContentAwareWorker extends EventTarget {
        readonly inner: Worker | null
        readonly delayed: boolean
        readonly timers = new Set<number>()
        onmessage: ((event: MessageEvent) => void) | null = null
        onerror: ((event: ErrorEvent) => void) | null = null
        onmessageerror: ((event: MessageEvent) => void) | null = null

        constructor(url: string | URL, options?: WorkerOptions) {
          super()
          this.delayed = /patch-match|seam-carving/.test(String(url))
          this.inner = this.delayed ? null : new NativeWorker(url, options)
          this.inner?.addEventListener('message', (event) => { this.onmessage?.(event); this.dispatchEvent(new MessageEvent('message', { data: event.data })) })
          this.inner?.addEventListener('error', (event) => { this.onerror?.(event); this.dispatchEvent(event) })
          this.inner?.addEventListener('messageerror', (event) => { this.onmessageerror?.(event); this.dispatchEvent(event) })
        }

        postMessage(message: unknown, transfer?: Transferable[]) {
          if (this.inner) this.inner.postMessage(message, transfer ?? [])
          else {
            const timer = window.setTimeout(() => {
              this.timers.delete(timer)
              const event = new MessageEvent('message', { data: { data: new ArrayBuffer(4), width: 1, height: 1 } })
              this.onmessage?.(event)
              this.dispatchEvent(event)
            }, 500)
            this.timers.add(timer)
          }
        }

        terminate() {
          if (this.delayed) terminations += 1
          for (const timer of this.timers) window.clearTimeout(timer)
          this.timers.clear()
          this.inner?.terminate()
        }
      }
      Object.defineProperty(window, 'Worker', { configurable: true, value: DelayedContentAwareWorker })
      Object.defineProperty(window, '__studioContentAwareCancellationTest', { configurable: true, value: () => terminations })
    })
    await openBlankEditor(page)
    await page.getByRole('button', { name: 'New layer', exact: true }).click()
    await page.getByRole('button', { name: 'Paint Bucket tool', exact: true }).click()
    const fill = page.getByLabel('Paint bucket surface')
    const bounds = await fill.boundingBox()
    expect(bounds).not.toBeNull()
    await fill.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } })
    await expect(fill).toHaveAttribute('aria-busy', 'false')

    const canvas = page.getByLabel('Composition canvas')
    const before = await canvas.evaluate((element: HTMLCanvasElement) => [...element.getContext('2d')!.getImageData(800, 500, 1, 1).data])
    await page.getByRole('button', { name: 'Rectangular Marquee tool', exact: true }).click()
    await page.mouse.move(bounds!.x + bounds!.width * 0.45, bounds!.y + bounds!.height * 0.45)
    await page.mouse.down()
    await page.mouse.move(bounds!.x + bounds!.width * 0.55, bounds!.y + bounds!.height * 0.55)
    await page.mouse.up()

    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Content-Aware Fill…', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'matching local texture patches' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('status').filter({ hasText: 'Content-aware fill cancelled' })).toBeVisible()

    await page.getByRole('button', { name: 'Apply local seam carving', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Content-aware scale is running' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('status').filter({ hasText: 'Content-aware scale cancelled' })).toBeVisible()
    await page.waitForTimeout(550)

    expect(await canvas.evaluate((element: HTMLCanvasElement) => [...element.getContext('2d')!.getImageData(800, 500, 1, 1).data])).toEqual(before)
    expect(await page.evaluate(() => (window as unknown as { __studioContentAwareCancellationTest(): number }).__studioContentAwareCancellationTest())).toBe(2)
  })
})
