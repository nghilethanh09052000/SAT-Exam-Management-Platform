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

// ─── Write tools (Phase 2) ───────────────────────────────────────────────────

const WRITE_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'create_course',
      description:
        'Create a new SAT course. teacher_id is automatically set to the logged-in teacher. Returns the new course id.',
      parameters: {
        type: 'object',
        properties: {
          title:      { type: 'string', description: 'Course name, e.g. "SAT Hè 2026 — Intensive"' },
          start_date: { type: 'string', description: 'ISO date YYYY-MM-DD. Defaults to today.' },
          end_date:   { type: 'string', description: 'ISO date YYYY-MM-DD. Defaults to 3 months from today.' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_class',
      description:
        'Create a class inside an existing course. Automatically creates "Tuần 1" so assignment instances can be published right away.',
      parameters: {
        type: 'object',
        properties: {
          course_id:     { type: 'string', description: 'Course UUID (from create_course or list_courses)' },
          title:         { type: 'string', description: 'Class name, e.g. "Lớp Sáng — Thứ 2,4,6"' },
          schedule_text: { type: 'string', description: 'Human-readable schedule, e.g. "Thứ 2, 4, 6 — 08:00–10:00"' },
        },
        required: ['course_id', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'enroll_students',
      description:
        'Enroll students into a class. Pass their email addresses or profile UUIDs. Students not found are reported but do not cause an error.',
      parameters: {
        type: 'object',
        properties: {
          class_id:    { type: 'string', description: 'Class UUID' },
          emails:      {
            type: 'array',
            items: { type: 'string' },
            description: 'Student email addresses to enroll',
          },
          student_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Student profile UUIDs (alternative to emails)',
          },
        },
        required: ['class_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'setup_mock_test',
      description:
        'One-shot: create an assignment with the given questions, then immediately publish it to a class. ' +
        'First use list_questions or search_questions to find question IDs, then call this. ' +
        'Returns assignment_id, instance_id, and question_count.',
      parameters: {
        type: 'object',
        properties: {
          title:             { type: 'string', description: 'Assignment/test title' },
          class_id:          { type: 'string', description: 'Class UUID to publish to' },
          question_ids:      {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of question UUIDs to include',
          },
          deadline:          { type: 'string', description: 'Deadline as ISO datetime, e.g. "2026-06-30T23:59:00+07:00"' },
          is_timed:          { type: 'boolean', description: 'Whether to enforce a time limit (default false)' },
          time_limit_minutes:{ type: 'number',  description: 'Time limit in minutes (only if is_timed is true)' },
          shuffle_questions:  { type: 'boolean', description: 'Randomise question order (default false)' },
          shuffle_options:    { type: 'boolean', description: 'Randomise answer option order (default false)' },
          max_retakes:       { type: 'number',  description: 'Number of allowed retakes (default 1)' },
        },
        required: ['title', 'class_id', 'question_ids', 'deadline'],
      },
    },
  },
]

// ─── Proposal tool ───────────────────────────────────────────────────────────
// The AI MUST call this before any write tool. The client renders a confirm card.

const PROPOSAL_TOOL: Tool = {
  type: 'function',
  function: {
    name: 'propose_action',
    description:
      'REQUIRED before any write operation (create_course, create_class, enroll_students, setup_mock_test). ' +
      'Present a structured plan to the user for confirmation. ' +
      'After calling this tool, stop and wait — do NOT call any write tools until the user explicitly confirms.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short summary of what will be done, e.g. "Tạo khóa học NGHI TEST 1 + 2 lớp"',
        },
        steps: {
          type: 'array',
          description: 'Ordered list of actions to execute after confirmation',
          items: {
            type: 'object',
            properties: {
              step:        { type: 'number',  description: 'Step number starting at 1' },
              tool:        { type: 'string',  description: 'Tool name that will be called' },
              description: { type: 'string',  description: 'Human-readable description in Vietnamese' },
              args:        { type: 'object',  description: 'Arguments that will be passed to the tool' },
            },
            required: ['step', 'tool', 'description', 'args'],
          },
        },
      },
      required: ['title', 'steps'],
    },
  },
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type AssistantRole = 'teacher' | 'admin'

export type ProposalStep = {
  step:        number
  tool:        string
  description: string
  args:        Record<string, unknown>
}

export type ActionProposal = {
  title: string
  steps: ProposalStep[]
}

export function getToolsForRole(role: AssistantRole): Tool[] {
  return [PROPOSAL_TOOL, ...READ_TOOLS, ...WRITE_TOOLS]
}

export const MAX_TOOL_ITERATIONS = 20
