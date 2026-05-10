export const testCredentials = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? 'admin@test.com',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'admin123!',
  },
  teacher: {
    email: process.env.E2E_TEACHER_EMAIL ?? 'teacher@test.com',
    password: process.env.E2E_TEACHER_PASSWORD ?? 'teacher123!',
  },
  student: {
    email: process.env.E2E_STUDENT_EMAIL ?? 'student@test.com',
    password: process.env.E2E_STUDENT_PASSWORD ?? 'student123!',
  },
}
