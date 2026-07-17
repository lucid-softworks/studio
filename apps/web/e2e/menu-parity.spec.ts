import { expect, test } from '@playwright/test'
import { studioMenuCommandParity } from '../../../packages/editor/src/editor/photopea-parity'

test('every built-in menu command is connected to the living parity inventory', async ({ page }) => {
  await page.goto('/app')
  await expect(page.getByLabel('Composition canvas')).toBeVisible()

  const observed = new Set<string>()
  const menuBar = page.getByRole('banner')
  for (const menuName of ['File', 'Edit', 'Image', 'Layer', 'Select', 'Filter', 'View', 'Help']) {
    await menuBar.getByRole('button', { name: menuName, exact: true }).click()
    const menu = page.getByRole('menu', { name: `${menuName} menu` })
    await expect(menu).toBeVisible()
    for (const id of await menu.locator('[data-command-id]').evaluateAll((items) => items.map((item) => item.getAttribute('data-command-id')).filter((value): value is string => Boolean(value)))) observed.add(id)
    await page.keyboard.press('Escape')
  }

  const inventory = new Set(studioMenuCommandParity.map((entry) => entry.id))
  expect([...observed].filter((id) => !id.startsWith('plugin.')).every((id) => inventory.has(id))).toBe(true)
  expect(studioMenuCommandParity.filter((entry) => entry.id !== 'file.desktop-scratch').every((entry) => observed.has(entry.id))).toBe(true)
})

test('format compatibility explains import and export retention before file operations', async ({ page }) => {
  await page.goto('/app')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Format compatibility…', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Format compatibility' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Filter formats').fill('PSD')
  await expect(dialog.getByRole('rowheader', { name: /Photoshop document/ })).toBeVisible()
  await expect(dialog.getByText('Partial', { exact: true })).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
