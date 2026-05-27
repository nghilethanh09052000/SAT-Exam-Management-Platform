/**
 * mcp/src/tools/students.ts
 *
 * MCP tools for Student & Class management:
 *   - list_students       — list all student profiles
 *   - get_student         — full profile + enrollment summary
 *   - list_classes        — list classes (optionally by course)
 *   - get_class_roster    — all students enrolled in a class
 *   - list_courses        — list courses
 */

import { z } from 'zod'
import type { AdminClient } from '../supabase.js'

// ─── Schemas ────────────────────────────────────────────────────────────────

export const ListStudentsInput = z.object({
  search:      z.string().optional().describe('Search by name or email'),
  is_approved: z.boolean().optional().describe('Filter by approval status'),
  limit:       z.number().int().min(1).max(200).default(50),
})

export const GetStudentInput = z.object({
  id: z.string().describe('Student profile UUID'),
})

export const ListClassesInput = z.object({
  course_id: z.string().optional().describe('Filter by course UUID'),
})

export const GetClassRosterInput = z.object({
  class_id: z.string().describe('Class UUID'),
})

export const ListCoursesInput = z.object({
  teacher_id: z.string().optional().describe('Filter by teacher UUID'),
})

// ─── Tool implementations ────────────────────────────────────────────────────

export async function listStudents(db: AdminClient, input: z.infer<typeof ListStudentsInput>) {
  let query = db
    .from('profiles')
    .select('id, full_name, email, role, is_active, is_approved, school, city, target_score, created_at')
    .eq('role', 'student')
    .is('is_active', true)
    .order('full_name', { ascending: true })
    .limit(input.limit)

  if (input.is_approved !== undefined) query = query.eq('is_approved', input.is_approved)

  const { data, error } = await query
  if (error) return { error: error.message }

  let results = data ?? []

  // Client-side search if provided (Supabase free tier doesn't always have full-text on profiles)
  if (input.search) {
    const q = input.search.toLowerCase()
    results = results.filter((s: any) =>
      (s.full_name ?? '').toLowerCase().includes(q) ||
      (s.email ?? '').toLowerCase().includes(q)
    )
  }

  return { data: results, error: null }
}

export async function getStudent(db: AdminClient, input: z.infer<typeof GetStudentInput>) {
  const { data: profile, error: pErr } = await db
    .from('profiles')
    .select('id, full_name, email, role, is_active, is_approved, phone, school, city, birth_year, gender, target_score, facebook_url, threads_url, created_at')
    .eq('id', input.id)
    .single()

  if (pErr) return { error: pErr.message }

  // Get class enrollments
  const { data: enrollments, error: eErr } = await db
    .from('enrollments')
    .select('id, enrolled_at, classes(id, title, courses(id, title))')
    .eq('student_id', input.id)

  if (eErr) return { error: eErr.message }

  return {
    data: {
      profile,
      enrollments: (enrollments ?? []).map((e: any) => ({
        enrollment_id: e.id,
        enrolled_at:   e.enrolled_at,
        class:         e.classes,
      })),
    },
    error: null,
  }
}

export async function listClasses(db: AdminClient, input: z.infer<typeof ListClassesInput>) {
  let query = db
    .from('classes')
    .select('id, course_id, title, schedule_text, archived_at, created_at, courses(id, title)')
    .is('archived_at', null)
    .order('created_at', { ascending: true })

  if (input.course_id) query = query.eq('course_id', input.course_id)

  const { data, error } = await query
  if (error) return { error: error.message }
  return { data, error: null }
}

export async function getClassRoster(db: AdminClient, input: z.infer<typeof GetClassRosterInput>) {
  const { data: classInfo, error: cErr } = await db
    .from('classes')
    .select('id, title, schedule_text, courses(id, title)')
    .eq('id', input.class_id)
    .single()

  if (cErr) return { error: cErr.message }

  const { data: enrollments, error: eErr } = await db
    .from('enrollments')
    .select('id, enrolled_at, profiles(id, full_name, email, is_approved, target_score)')
    .eq('class_id', input.class_id)
    .order('enrolled_at', { ascending: true })

  if (eErr) return { error: eErr.message }

  return {
    data: {
      class: classInfo,
      roster: (enrollments ?? []).map((e: any) => ({
        enrollment_id: e.id,
        enrolled_at:   e.enrolled_at,
        student:       e.profiles,
      })),
      total: (enrollments ?? []).length,
    },
    error: null,
  }
}

export async function listCourses(db: AdminClient, input: z.infer<typeof ListCoursesInput>) {
  let query = db
    .from('courses')
    .select('id, title, teacher_id, archived_at, created_at, profiles(full_name, email)')
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  if (input.teacher_id) query = query.eq('teacher_id', input.teacher_id)

  const { data, error } = await query
  if (error) return { error: error.message }
  return { data, error: null }
}
