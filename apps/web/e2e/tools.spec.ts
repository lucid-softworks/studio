import { expect, test, type Page } from '@playwright/test'

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
  })
})
