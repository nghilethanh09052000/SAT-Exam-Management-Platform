import { test, expect } from '@playwright/test'
import { testCredentials } from './fixtures'

test.describe('Authentication', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible()
    await expect(page.getByText('Đăng nhập cho học sinh')).toBeVisible()
    await page.getByText('Đăng nhập cho giáo viên/admin').click()
    await expect(page.getByPlaceholder('giaovien@example.com')).toBeVisible()
  })

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByText('Đăng nhập cho giáo viên/admin').click()
    await page.fill('input[type="email"]', 'invalid@email.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')
    await expect(
      page.getByText(/Email hoặc mật khẩu không đúng/)
    ).toBeVisible({ timeout: 10000 })
  })

  test('admin login redirects to /admin', async ({ page }) => {
    await page.goto('/login')
    await page.getByText('Đăng nhập cho giáo viên/admin').click()
    await page.fill('input[type="email"]', testCredentials.admin.email)
    await page.fill('input[type="password"]', testCredentials.admin.password)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/admin', { timeout: 15000 })
  })

  test('teacher login redirects to /teacher', async ({ page }) => {
    await page.goto('/login')
    await page.getByText('Đăng nhập cho giáo viên/admin').click()
    await page.fill('input[type="email"]', testCredentials.teacher.email)
    await page.fill('input[type="password"]', testCredentials.teacher.password)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/teacher', { timeout: 15000 })
  })

  test('unauthenticated user is redirected to login from /admin', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })

  test('unauthenticated user is redirected to login from /teacher', async ({ page }) => {
    await page.goto('/teacher')
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })

  test('unauthenticated user is redirected to login from /student', async ({ page }) => {
    await page.goto('/student')
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })
})
