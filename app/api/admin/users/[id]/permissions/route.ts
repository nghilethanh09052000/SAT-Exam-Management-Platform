import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/lib/with-auth'
import { ALL_PERMISSIONS, type Permission } from '@/lib/permissions'

export const runtime = 'nodejs'

const PermissionSchema = z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]])

const UpdatePermissionsSchema = z.object({
  permissions: z.array(PermissionSchema),
  class_ids: z.array(z.string().uuid()),
})

export const GET = withAdmin<{ id: string }>(async (_req, { db, params }) => {
  const { data: target, error: targetError } = await db
    .from('profiles')
    .select('id, role')
    .eq('id', params.id)
    .in('role', ['admin', 'teacher'])
    .maybeSingle()

  if (targetError) return NextResponse.json({ data: null, error: targetError.message }, { status: 400 })
  if (!target) return NextResponse.json({ data: null, error: 'Staff account not found' }, { status: 404 })

  const [{ data: perms, error: permsError }, { data: assignments, error: assignmentsError }] = await Promise.all([
    db.from('user_permissions').select('permission').eq('user_id', params.id),
    db.from('staff_class_assignments').select('class_id').eq('user_id', params.id),
  ])

  const error = permsError ?? assignmentsError
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })

  return NextResponse.json({
    data: {
      permissions: ((perms ?? []) as { permission: Permission }[]).map((row) => row.permission),
      class_ids: ((assignments ?? []) as { class_id: string }[]).map((row) => row.class_id),
    },
    error: null,
  })
})

export const PUT = withAdmin<{ id: string }>(async (req, { user, db, params }) => {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = UpdatePermissionsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.issues[0]?.message ?? 'Invalid permissions' }, { status: 400 })
  }

  const { data: target, error: targetError } = await db
    .from('profiles')
    .select('id, role')
    .eq('id', params.id)
    .in('role', ['admin', 'teacher'])
    .maybeSingle()

  if (targetError) return NextResponse.json({ data: null, error: targetError.message }, { status: 400 })
  if (!target) return NextResponse.json({ data: null, error: 'Staff account not found' }, { status: 404 })
  if ((target as { role: string }).role !== 'teacher') {
    return NextResponse.json({ data: null, error: 'Admin accounts always have full access.' }, { status: 400 })
  }

  const nextPermissions = Array.from(new Set(parsed.data.permissions))
  const nextClassIds = Array.from(new Set(parsed.data.class_ids))

  // Validate class ids BEFORE any mutation. The save replaces rows with delete-then-insert
  // (not a single transaction), so a class_id that's well-formed but doesn't exist would
  // fail the FK insert *after* the deletes already ran — wiping the staff member's grants.
  // Catch it up front and bail without touching anything.
  if (nextClassIds.length > 0) {
    const { data: existingClasses, error: classCheckError } = await db
      .from('classes')
      .select('id')
      .in('id', nextClassIds)
    if (classCheckError) return NextResponse.json({ data: null, error: classCheckError.message }, { status: 400 })
    const found = new Set(((existingClasses ?? []) as { id: string }[]).map((c) => c.id))
    const missing = nextClassIds.filter((id) => !found.has(id))
    if (missing.length > 0) {
      return NextResponse.json({ data: null, error: `Unknown class id(s): ${missing.join(', ')}` }, { status: 400 })
    }
  }

  const [{ data: currentPermRows }, { data: currentClassRows }] = await Promise.all([
    db.from('user_permissions').select('permission').eq('user_id', params.id),
    db.from('staff_class_assignments').select('class_id').eq('user_id', params.id),
  ])

  const currentPermissions = new Set(((currentPermRows ?? []) as { permission: Permission }[]).map((row) => row.permission))
  const currentClassIds = new Set(((currentClassRows ?? []) as { class_id: string }[]).map((row) => row.class_id))
  const nextPermissionSet = new Set(nextPermissions)
  const nextClassSet = new Set(nextClassIds)

  const auditRows = [
    ...nextPermissions
      .filter((permission) => !currentPermissions.has(permission))
      .map((permission) => ({ actor_id: user.id, target_id: params.id, action: 'grant', detail: permission })),
    ...Array.from(currentPermissions)
      .filter((permission) => !nextPermissionSet.has(permission))
      .map((permission) => ({ actor_id: user.id, target_id: params.id, action: 'revoke', detail: permission })),
    ...nextClassIds
      .filter((classId) => !currentClassIds.has(classId))
      .map((classId) => ({ actor_id: user.id, target_id: params.id, action: 'assign_class', detail: classId })),
    ...Array.from(currentClassIds)
      .filter((classId) => !nextClassSet.has(classId))
      .map((classId) => ({ actor_id: user.id, target_id: params.id, action: 'unassign_class', detail: classId })),
  ]

  const [{ error: deletePermsError }, { error: deleteClassesError }] = await Promise.all([
    db.from('user_permissions').delete().eq('user_id', params.id),
    db.from('staff_class_assignments').delete().eq('user_id', params.id),
  ])

  const deleteError = deletePermsError ?? deleteClassesError
  if (deleteError) return NextResponse.json({ data: null, error: deleteError.message }, { status: 400 })

  if (nextPermissions.length > 0) {
    const { error } = await db
      .from('user_permissions')
      .insert(nextPermissions.map((permission) => ({ user_id: params.id, permission })))
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  }

  if (nextClassIds.length > 0) {
    const { error } = await db
      .from('staff_class_assignments')
      .insert(nextClassIds.map((class_id) => ({ user_id: params.id, class_id })))
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })
  }

  if (auditRows.length > 0) {
    await db.from('permission_audit').insert(auditRows)
  }

  return NextResponse.json({
    data: { permissions: nextPermissions, class_ids: nextClassIds },
    error: null,
  })
})
