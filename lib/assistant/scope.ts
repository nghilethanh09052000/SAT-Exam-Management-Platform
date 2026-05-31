/**
 * lib/assistant/scope.ts
 *
 * Injects role-based scope into tool arguments so a teacher can never
 * read data outside their own courses, regardless of what the model asks for.
 *
 * Admin role lifts all restrictions.
 */

type Role = 'teacher' | 'admin'

/**
 * For write-class tools, enforce the actor owns the resource.
 * For read tools that filter by teacher, inject the teacherId.
 */
export function scopeArgs(
  role: Role,
  actorId: string,
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (role === 'admin') {
    // Admin can create resources — inject actorId as owner for write tools
    // (unless a different teacher_id is already explicitly provided in args)
    const ownerFieldAdmin: Record<string, string> = {
      create_course:   'teacher_id',
      setup_mock_test: 'teacher_id',
      create_assignment: 'created_by',
      create_question: 'created_by',
    }
    const field = ownerFieldAdmin[toolName]
    if (field && !args[field]) return { ...args, [field]: actorId }
    return args
  }

  // Tools that must be filtered to the teacher's courses/assignments
  const teacherFilteredTools: Record<string, string> = {
    list_courses:     'teacher_id',
    list_assignments: 'created_by',
  }

  const filterField = teacherFilteredTools[toolName]
  if (filterField) {
    return { ...args, [filterField]: actorId }
  }

  // Inject actor as owner for all create/write tools
  const ownerField: Record<string, string> = {
    create_assignment: 'created_by',
    create_question:   'created_by',
    create_course:     'teacher_id',
    setup_mock_test:   'teacher_id',
  }
  const field = ownerField[toolName]
  if (field) return { ...args, [field]: actorId }

  return args
}
