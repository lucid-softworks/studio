import { expect, test } from '@playwright/test'

test('vectorizes a bitmap into one undoable editable compound shape layer', async ({ page }) => {
  await page.goto('/app')
  await expect(page.getByLabel('Composition canvas')).toBeVisible()

  await page.getByRole('button', { name: 'New layer', exact: true }).click()
  await page.getByRole('button', { name: 'Paint Bucket tool', exact: true }).click()
  const fill = page.getByLabel('Paint bucket surface')
  const revision = await page.getByLabel('Composition canvas').getAttribute('data-render-revision')
  await fill.click({ position: { x: 320, y: 220 } })
  await expect(fill).toHaveAttribute('aria-busy', 'false')
  await expect.poll(() => page.getByLabel('Composition canvas').getAttribute('data-render-revision')).not.toBe(revision)
  await page.getByRole('button', { name: 'Image', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Vectorize bitmap…', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Vectorize bitmap' })
  await expect(dialog.getByLabel('Vector threshold')).toHaveValue('128')
  await expect(dialog.getByLabel('Vector smoothing')).toHaveValue('35')
  await expect(dialog.getByLabel('Vector corner threshold')).toHaveValue('55')
  await expect(dialog.getByLabel('Vector noise removal')).toHaveValue('2')
  await dialog.getByLabel('Vector threshold').fill('255')
  await dialog.getByRole('button', { name: 'Create shapes', exact: true }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByText('3 objects · 0 folders', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Layer 2 trace shape layer', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Undo', exact: true }).click()
  await expect(page.getByText('2 objects · 0 folders', { exact: true })).toBeVisible()
})
