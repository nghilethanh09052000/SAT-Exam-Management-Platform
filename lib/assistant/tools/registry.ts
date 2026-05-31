/**
 * lib/assistant/tools/registry.ts
 *
 * Tool definitions in OpenAI function-calling format.
 * Returns only the tools allowed for the given role.
 *
 * Phase 1: read-only tools (teacher + admin)
 * Phase 2: write tools (teacher + admin) — create_question, create_assignment
 * Phase 3: admin-only ops tools
 */

import type OpenAI from 'openai'

type Tool = OpenAI.Chat.ChatCompletionTool

// ─── Read tools (Phase 1) ────────────────────────────────────────────────────

const READ_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'get_class_summary',
      description:
        'Get a high-level summary for a class: enrolment count, average score, completion rate, and recent assignment stats. Use this first when asked about a class.',
      parameters: {
        type: 'object',
        properties: {
          class_id:  { type: 'string', description: 'Class UUID' },
          days_back: { type: 'number', description: 'Look-back window in days (default 14)' },
        },
        required: ['class_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weak_students',
      description:
        'List students in a class whose average score is below a threshold. Returns student name, email, submission count, and average score.',
      parameters: {
        type: 'object',
        properties: {
          class_id:      { type: 'string', description: 'Class UUID' },
          threshold_pct: { type: 'number', description: 'Flag students below this % (default 60)' },
          limit:         { type: 'number', description: 'Max students to return (default 10)' },
        },
        required: ['class_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_classes',
      description: 'List classes. For a teacher, optionally filter by course_id.',
      parameters: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Filter by course UUID (optional)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_class_roster',
      description: 'Get all students enrolled in a specific class.',
      parameters: {
        type: 'object',
        properties: {
          class_id: { type: 'string', description: 'Class UUID' },
        },
        required: ['class_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_courses',
      description: "List all courses. For a teacher this will be scoped to their own courses automatically.",
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_students',
      description: 'List student profiles. Filter by approval status or search by name/email.',
      parameters: {
        type: 'object',
        properties: {
          search:      { type: 'string', description: 'Search by name or email' },
          is_approved: { type: 'boolean', description: 'Filter by approval status' },
          limit:       { type: 'number', description: 'Max results (default 50)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_student',
      description: "Get a student's full profile including class enrollments.",
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Student profile UUID' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_student_progress',
      description:
        "Get a student's submission history: scores over time, best score, average score.",
      parameters: {
        type: 'object',
        properties: {
          student_id: { type: 'string', description: 'Student UUID' },
          limit:      { type: 'number', description: 'Max submissions to return (default 20)' },
        },
        required: ['student_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_class_leaderboard',
      description: 'Get top-N ranked scores for a class on a specific assignment instance.',
      parameters: {
        type: 'object',
        properties: {
          instance_id: { type: 'string', description: 'Assignment instance UUID' },
          top_n:       { type: 'number', description: 'Number of top students to return (default 10)' },
        },
        required: ['instance_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_assignments',
      description: "List assignments. For a teacher this is automatically scoped to their own assignments.",
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max results (default 20)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_submission_stats',
      description:
        'Get aggregate submission stats for an assignment — average score, completion rate, time spent.',
      parameters: {
        type: 'object',
        properties: {
          assignment_id: { type: 'string', description: 'Assignment UUID' },
          instance_id:   { type: 'string', description: 'Narrow to a specific instance (optional)' },
        },
        required: ['assignment_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_questions',
      description:
        'Full-text search the question bank by content or topic keyword.',
      parameters: {
        type: 'object',
        properties: {
          query:      { type: 'string', description: 'Search keyword or phrase' },
          subject:    { type: 'string', enum: ['math', 'reading_writing'], description: 'Optional subject filter' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'], description: 'Optional difficulty filter' },
          limit:      { type: 'number', description: 'Max results (default 20)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_questions',
      description:
        'List questions from the question bank with optional filters.',
      parameters: {
        type: 'object',
        properties: {
          subject:    { type: 'string', enum: ['math', 'reading_writing'] },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
          type:       { type: 'string', enum: ['multiple_choice', 'short_answer'] },
          limit:      { type: 'number', description: 'Max results (default 20, max 100)' },
        },
        required: [],
      },
    },
  },
]

// ─── Public API ──────────────────────────────────────────────────────────────

export type AssistantRole = 'teacher' | 'admin'

export function getToolsForRole(role: AssistantRole): Tool[] {
  // Both teacher and admin get the same read tools in Phase 1.
  // Admin-only tools (ops) will be added in Phase 3.
  return READ_TOOLS
}

export const MAX_TOOL_ITERATIONS = 10
