import { expect, test, type Page } from '@playwright/test'

async function setZoom(page: Page, zoom: number) {
  const readZoom = async () => Number((await page.getByTitle('Drag horizontally for scrubby zoom · click to reset').textContent())?.replace('%', ''))
  while (await readZoom() < zoom) await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  while (await readZoom() > zoom) await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
}

async function stabilizeCanvasPresentation(page: Page, zoom: number) {
  await page.getByLabel('Composition canvas').evaluate((canvas: HTMLCanvasElement, scale: number) => {
    const transformContainer = canvas.parentElement?.parentElement
    if (transformContainer instanceof HTMLElement) {
      transformContainer.style.aspectRatio = 'auto'
      transformContainer.style.transform = 'none'
    }
    const width = 744 * scale
    canvas.style.position = 'fixed'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.width = `${width}px`
    canvas.style.height = `${width * canvas.height / canvas.width}px`
    canvas.style.maxWidth = 'none'
    canvas.style.maxHeight = 'none'
  }, zoom / 100)
}

test.describe('composition visual baselines', () => {
  test.use({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })

  for (const fixture of ['2k', 'high-depth'] as const) {
    for (const zoom of [100, 200] as const) {
      test(`${fixture} fixture at ${zoom}% zoom`, async ({ page }) => {
        await page.goto(`/app?benchmark=${fixture}`)
        const canvas = page.getByLabel('Composition canvas')
        await expect(canvas).toHaveAttribute('data-render-revision', /\d+/)

        await setZoom(page, zoom)
        await stabilizeCanvasPresentation(page, zoom)

        await expect(canvas).toHaveScreenshot(`${fixture}-${zoom}.png`, {
          animations: 'disabled',
          maxDiffPixelRatio: 0.001,
        })
      })
    }
  }

  for (const fixture of ['renderer-native-8', 'renderer-native-16', 'renderer-native-32', 'renderer-compat-16'] as const) {
    for (const zoom of [50, 100, 200] as const) {
      test(`${fixture} Canvas2D feature fixture at ${zoom}% zoom`, async ({ page }) => {
        await page.goto(`/app?benchmark=${fixture}&renderer=canvas2d`)
        const canvas = page.getByLabel('Composition canvas')
        await expect(canvas).toHaveAttribute('data-render-revision', /\d+/)
        await expect(canvas).toHaveAttribute('data-renderer', 'canvas2d')
        await setZoom(page, zoom)
        await stabilizeCanvasPresentation(page, zoom)
        await expect(canvas).toHaveScreenshot(`${fixture}-canvas2d-${zoom}.png`, {
          animations: 'disabled',
          maxDiffPixelRatio: 0.001,
        })
      })
    }
  }

  test('TypeGPU native output matches Canvas2D when WebGPU is available', async ({ browser }) => {
    const typeGpuPage = await browser.newPage()
    await typeGpuPage.goto('/app?benchmark=renderer-native-16')
    const typeGpuCanvas = typeGpuPage.getByLabel('Composition canvas')
    await expect(typeGpuCanvas).toHaveAttribute('data-render-revision', /\d+/)
    test.skip(await typeGpuCanvas.getAttribute('data-renderer') !== 'webgpu', 'This browser does not expose WebGPU.')

    const canvasPage = await browser.newPage()
    await canvasPage.goto('/app?benchmark=renderer-native-16&renderer=canvas2d')
    const canvas2d = canvasPage.getByLabel('Composition canvas')
    await expect(canvas2d).toHaveAttribute('data-render-revision', /\d+/)

    for (const zoom of [50, 100, 200]) {
      await setZoom(typeGpuPage, zoom)
      await setZoom(canvasPage, zoom)
      const [gpu, canvas] = await Promise.all([typeGpuCanvas, canvas2d].map((surface) => surface.evaluate((element: HTMLCanvasElement) => {
        const context = element.getContext('2d')!
        const samples: number[] = []
        for (let y = 50; y < element.height; y += 100) for (let x = 50; x < element.width; x += 100) samples.push(...context.getImageData(x, y, 1, 1).data)
        return samples
      })))
      expect(gpu).toHaveLength(canvas.length)
      expect(Math.max(...gpu.map((channel, index) => Math.abs(channel - canvas[index])))).toBeLessThanOrEqual(4)
    }

    await typeGpuPage.close()
    await canvasPage.close()
  })
})
