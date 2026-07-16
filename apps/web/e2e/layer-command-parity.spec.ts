import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test.beforeEach(async ({ page }) => {
  await page.goto('/app')
  await expect(page.getByLabel('Composition canvas')).toBeVisible()
  await expect(page.getByText('1 object · 0 folders', { exact: true })).toBeVisible()
})

test('layer menu and keyboard commands create, duplicate, delete, undo, and redo once', async ({ page }) => {
  await page.getByRole('button', { name: 'Layer', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New layer', exact: true }).click()
  await expect(page.getByText('2 objects · 0 folders', { exact: true })).toBeVisible()

  await page.keyboard.press('Control+j')
  await expect(page.getByText('3 objects · 0 folders', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Layer 2 copy layer', exact: true })).toBeVisible()

  await page.keyboard.press('Delete')
  await expect(page.getByText('2 objects · 0 folders', { exact: true })).toBeVisible()

  await page.keyboard.press('Control+z')
  await expect(page.getByText('3 objects · 0 folders', { exact: true })).toBeVisible()
  await page.keyboard.press('Control+Shift+z')
  await expect(page.getByText('2 objects · 0 folders', { exact: true })).toBeVisible()

  await page.keyboard.press('Control+Shift+n')
  await expect(page.getByText('3 objects · 0 folders', { exact: true })).toBeVisible()
})

test('groups duplicate and delete as complete nested stacks', async ({ page }) => {
  await page.getByRole('button', { name: 'Layer', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New group', exact: true }).click()
  await expect(page.getByText('1 object · 1 folder', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Layer', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Duplicate layer or group', exact: true }).click()
  await expect(page.getByText('2 objects · 2 folders', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Group 1 copy group', exact: true })).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Save Studio project', exact: true }).click()
  const download = await downloadPromise
  const saved = JSON.parse(await readFile((await download.path())!, 'utf8')) as { document: { groups: unknown[]; layers: Array<{ groupId?: string | null }> } }
  expect(saved.document.groups).toHaveLength(2)
  expect(saved.document.layers).toHaveLength(2)
  expect(saved.document.layers.every((layer) => typeof layer.groupId === 'string')).toBe(true)

  await page.getByRole('button', { name: 'Layer', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delete layer or group', exact: true }).click()
  await expect(page.getByText('1 object · 1 folder', { exact: true })).toBeVisible()

  await page.keyboard.press('Control+z')
  await expect(page.getByText('2 objects · 2 folders', { exact: true })).toBeVisible()
})

test('layer context menu operates on the row under the pointer', async ({ page }) => {
  await page.getByRole('button', { name: 'Layer 1 layer', exact: true }).click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'Layer context menu' })
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Duplicate layer', exact: true }).click()
  await expect(page.getByText('2 objects · 0 folders', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Layer 1 copy layer', exact: true }).click({ button: 'right' })
  await menu.getByRole('menuitem', { name: 'Group selection', exact: true }).click()
  await expect(page.getByText('2 objects · 1 folder', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Group 1 group', exact: true }).click({ button: 'right' })
  await menu.getByRole('menuitem', { name: 'Delete group', exact: true }).click()
  await expect(page.getByText('1 object · 0 folders', { exact: true })).toBeVisible()
})
