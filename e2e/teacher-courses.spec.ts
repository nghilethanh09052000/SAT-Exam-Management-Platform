import { test, expect } from '@playwright/test'
import { testCredentials } from './fixtures'

async function loginAsTeacher(page: ReturnType<typeof test['info']> extends infer T ? never : Parameters<Parameters<typeof test>[1]>[0]['page']) {
  await page.goto('/login')
  await page.fill('input[type="email"]', testCredentials.teacher.email)
  await page.fill('input[type="password"]', testCredentials.teacher.password)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/teacher', { timeout: 15000 })
}

test.describe('Teacher - Course Management', () => {
  test('teacher can view courses page', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', testCredentials.teacher.email)
    await page.fill('input[type="password"]', testCredentials.teacher.password)
    await page.click('button[type="submit"]')
    await page.waitForURL('/teacher', { timeout: 15000 })

    await page.click('text=Khóa học')
    await expect(page).toHaveURL('/teacher/courses')
    await expect(page.getByText('Khóa học')).toBeVisible()
    await expect(page.getByText('Tạo khóa học mới')).toBeVisible()
  })

  test('teacher can navigate to create course page', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', testCredentials.teacher.email)
    await page.fill('input[type="password"]', testCredentials.teacher.password)
    await page.click('button[type="submit"]')
    await page.waitForURL('/teacher', { timeout: 15000 })

    await page.goto('/teacher/courses/new')
    await expect(page.getByText('Tạo khóa học mới')).toBeVisible()
    await expect(page.getByPlaceholder('Ví dụ: SAT Spring 2025')).toBeVisible()
  })

  test('teacher can create a course', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', testCredentials.teacher.email)
    await page.fill('input[type="password"]', testCredentials.teacher.password)
    await page.click('button[type="submit"]')
    await page.waitForURL('/teacher', { timeout: 15000 })

    await page.goto('/teacher/courses/new')
    await page.fill('input[placeholder="Ví dụ: SAT Spring 2025"]', 'Test Course E2E')
    await page.fill('input[type="date"]:first-of-type', '2025-01-01')
    await page.fill('input[type="date"]:last-of-type', '2025-06-30')
    await page.click('button[type="submit"]')

    // Should redirect to course detail
    await expect(page).toHaveURL(/\/teacher\/courses\/[a-z0-9-]+/, { timeout: 10000 })
    await expect(page.getByText('Test Course E2E')).toBeVisible()
  })

  test('teacher dashboard shows stats', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', testCredentials.teacher.email)
    await page.fill('input[type="password"]', testCredentials.teacher.password)
    await page.click('button[type="submit"]')
    await page.waitForURL('/teacher', { timeout: 15000 })

    await expect(page.getByText('Khóa học hoạt động')).toBeVisible()
    await expect(page.getByText('Bài tập đang mở')).toBeVisible()
    await expect(page.getByText('Câu hỏi trong ngân hàng')).toBeVisible()
  })
})
