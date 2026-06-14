import {
  hasPermission,
  inAssignedClass,
  requirePermission,
  requireClassScope,
  type AuthProfile,
} from '@/lib/authz'
import { fetchUserAccess } from '@/lib/permissions'

// ── Fixtures ─────────────────────────────────────────────────────────────────
const admin: AuthProfile = { id: 'a', role: 'admin', is_active: true, permissions: [], class_ids: [] }
const student: AuthProfile = { id: 's', role: 'student', is_active: true, permissions: [], class_ids: [] }
const teacher: AuthProfile = {
  id: 't',
  role: 'teacher',
  is_active: true,
  permissions: ['materials:view', 'grading:update'],
  class_ids: ['class-1', 'class-2'],
}

describe('hasPermission', () => {
  it('denies a null profile', () => {
    expect(hasPermission(null, 'materials:view')).toBe(false)
  })

  it('grants admin everything (god mode), even without the grant', () => {
    expect(hasPermission(admin, 'materials:delete')).toBe(true)
    expect(hasPermission(admin, 'classes:delete')).toBe(true)
  })

  it('grants a teacher only their held permissions', () => {
    expect(hasPermission(teacher, 'materials:view')).toBe(true)
    expect(hasPermission(teacher, 'grading:update')).toBe(true)
    expect(hasPermission(teacher, 'materials:delete')).toBe(false)
    expect(hasPermission(teacher, 'students:delete')).toBe(false)
  })

  it('denies students', () => {
    expect(hasPermission(student, 'performance:view')).toBe(false)
  })
})

describe('inAssignedClass', () => {
  it('denies a null profile', () => {
    expect(inAssignedClass(null, 'class-1')).toBe(false)
  })

  it('scopes admin to all classes', () => {
    expect(inAssignedClass(admin, 'any-class')).toBe(true)
  })

  it('limits a teacher to assigned classes', () => {
    expect(inAssignedClass(teacher, 'class-1')).toBe(true)
    expect(inAssignedClass(teacher, 'class-2')).toBe(true)
    expect(inAssignedClass(teacher, 'class-3')).toBe(false)
  })
})

describe('requirePermission', () => {
  it('returns ok for admin', () => {
    expect(requirePermission({ profile: admin }, 'materials:delete')).toEqual({ ok: true })
  })

  it('returns ok when the teacher holds the permission', () => {
    expect(requirePermission({ profile: teacher }, 'materials:view')).toEqual({ ok: true })
  })

  it('returns a 403 AuthzResult when the teacher lacks it', () => {
    expect(requirePermission({ profile: teacher }, 'materials:delete')).toEqual({
      ok: false,
      status: 403,
      error: 'Forbidden',
    })
  })
})

describe('requireClassScope', () => {
  it('returns ok for admin on any class', () => {
    expect(requireClassScope({ profile: admin }, 'whatever')).toEqual({ ok: true })
  })

  it('returns ok for a teacher on an assigned class', () => {
    expect(requireClassScope({ profile: teacher }, 'class-1')).toEqual({ ok: true })
  })

  it('returns a 403 AuthzResult for a teacher on an unassigned class', () => {
    expect(requireClassScope({ profile: teacher }, 'class-9')).toEqual({
      ok: false,
      status: 403,
      error: 'Forbidden',
    })
  })
})

describe('fetchUserAccess', () => {
  // Minimal stub of the parts of the Supabase client fetchUserAccess touches.
  function stubDb(rows: Record<string, unknown[]>) {
    return {
      from: (table: string) => ({
        select: () => ({
          eq: () => Promise.resolve({ data: rows[table] ?? [] }),
        }),
      }),
    }
  }

  it('skips the DB and returns empty for admin', async () => {
    const exploding = { from: () => { throw new Error('should not query for admin') } }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(fetchUserAccess(exploding as any, 'a', 'admin')).resolves.toEqual({
      permissions: [],
      class_ids: [],
    })
  })

  it('skips the DB and returns empty for students', async () => {
    const exploding = { from: () => { throw new Error('should not query for student') } }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(fetchUserAccess(exploding as any, 's', 'student')).resolves.toEqual({
      permissions: [],
      class_ids: [],
    })
  })

  it('maps permission + class_id rows for a teacher', async () => {
    const db = stubDb({
      user_permissions: [{ permission: 'materials:view' }, { permission: 'students:create' }],
      staff_class_assignments: [{ class_id: 'class-1' }, { class_id: 'class-2' }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(fetchUserAccess(db as any, 't', 'teacher')).resolves.toEqual({
      permissions: ['materials:view', 'students:create'],
      class_ids: ['class-1', 'class-2'],
    })
  })

  it('returns empty arrays when a teacher has no grants', async () => {
    const db = stubDb({ user_permissions: [], staff_class_assignments: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(fetchUserAccess(db as any, 't', 'teacher')).resolves.toEqual({
      permissions: [],
      class_ids: [],
    })
  })
})
