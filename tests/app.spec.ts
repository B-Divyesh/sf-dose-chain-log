import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function clearLocalData(page: import('@playwright/test').Page): Promise<void> {
  // Opening the app creates an IndexedDB connection. Clear it from the static
  // offline page first, and await the IDB request itself rather than merely
  // awaiting the request object.
  await page.goto('/offline.html')
  await page.evaluate(async () => {
    localStorage.clear()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('dose-chain-log')
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('The local test database remained open.'))
    })
  })
}

async function waitForServiceWorkerControl(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
    }
    if (!navigator.serviceWorker.controller) throw new Error('The active service worker did not claim this page.')
  })
}

test.beforeEach(async ({ page }) => {
  await clearLocalData(page)
  await page.goto('/')
})

test('creates a group, records it in one tap, and schedules from actual time', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/dose chain/i)
  await page.getByRole('button', { name: 'Create first window' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Window name').fill('Morning set')
  await dialog.getByLabel('Planned time').fill('08:00')
  await dialog.getByLabel('Medicine name').fill('Vitamin D')
  await dialog.getByLabel('Follow-up after taken').selectOption('15')
  await dialog.getByRole('button', { name: 'Add another medicine' }).click()
  await dialog.getByLabel('Medicine name').nth(1).fill('Prescription A')
  await dialog.getByRole('button', { name: 'Save window' }).click()

  await expect(page.getByRole('heading', { name: 'Morning set' })).toBeVisible()
  await page.getByRole('button', { name: 'Mark all taken now' }).click()
  await expect(page.locator('#toast').getByText('2 medicines logged taken now.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Vitamin D' })).toBeVisible()
  await expect(page.getByText(/15 min from actual taken time/)).toBeVisible()

  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.getByText('Prescription A')).toBeVisible()
  await expect(page.locator('.history-list li')).toHaveCount(2)
})

test('opens and closes setup from the keyboard without losing focus', async ({ page }) => {
  const create = page.getByRole('button', { name: 'Create first window' })
  await create.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Window name')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(create).toBeFocused()
})

test('persists locally and works after the network goes offline', async ({ page, context }) => {
  await page.getByRole('button', { name: 'Create first window' }).click()
  await page.getByLabel('Window name').fill('Evening')
  await page.getByLabel('Medicine name').fill('Tablet B')
  await page.getByRole('button', { name: 'Save window' }).click()
  await waitForServiceWorkerControl(page)
  await expect(page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).resolves.toMatch(/\/sw\.js$/)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('Offline · logging locally')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Evening' })).toBeVisible()
  await page.getByRole('button', { name: 'Mark all taken now' }).click()
  await expect(page.locator('#toast').getByText('1 medicine logged taken now.')).toBeVisible()
})

test('has no serious accessibility violations on empty and configured states', async ({ page }) => {
  let results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([])

  await page.getByRole('button', { name: 'Create first window' }).click()
  await page.getByLabel('Window name').fill('Noon')
  await page.getByLabel('Medicine name').fill('Medicine')
  await page.getByRole('button', { name: 'Save window' }).click()
  results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([])
})

test('keeps the free tier useful and offers restore for additional windows', async ({ page }) => {
  await page.getByRole('button', { name: 'Create first window' }).click()
  await page.getByLabel('Window name').fill('Morning')
  await page.getByLabel('Medicine name').fill('Medicine')
  await page.getByRole('button', { name: 'Save window' }).click()
  await page.getByRole('button', { name: 'Windows' }).click()
  await page.getByRole('button', { name: 'Add window' }).click()
  await expect(page.getByRole('heading', { name: 'More windows, once.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Buy full unlock' })).toHaveAttribute('href', /api\.sociobot\.in/)
  await page.getByText('Have a license? Restore it').click()
  await expect(page.getByLabel('License token')).toBeVisible()
})

test('serves standalone legal pages', async ({ page }) => {
  await page.goto('/privacy/')
  await expect(page).toHaveTitle(/Privacy/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/stays yours/i)
  await page.goto('/terms/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/not clinical guidance/i)
})

test('loads without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', error => errors.push(error.message))
  await page.reload()
  await expect(page.getByRole('main')).toBeVisible()
  expect(errors).toEqual([])
})
