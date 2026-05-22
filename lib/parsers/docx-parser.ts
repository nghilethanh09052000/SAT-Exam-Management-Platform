/**
 * lib/parsers/docx-parser.ts
 * Parses .docx files following the DOCX-TEMPLATE.md format.
 *
 * Format rules:
 * - Module headings: **Module N: [name]** (bold, own line)
 * - Question start:  **Question N** (bold, own line)
 * - Correct answer:  option with is_bold = true from Mammoth.js
 * - Short answer:    has "- **Answer:**" instead of "- **Options:**"
 * - Images:          extracted as base64 via Mammoth transformElement
 * - Content hash:    SHA256(normalize(question_text + correct_answer))
 *
 * Returns { success, questions[], errors[] } — never partially saves on error.
 */

import mammoth from 'mammoth'
import { generateContentHash } from '@/lib/utils/hash'
import type { ParseResult, ParsedQuestion, ParsedOption, ParseError } from '@/types'

// ─── ACCEPTED MODULE NAMES ───────────────────────────────────────────────────

const VALID_MODULES = [
  'Module 1: Reading and Writing',
  'Module 2: Reading and Writing',
  'Module 1: Math',
  'Module 2: Math',
] as const

const DEFAULT_MODULE = 'Bài thi'

// ─── INTERNAL PARAGRAPH TYPE ─────────────────────────────────────────────────

export interface RawParagraph {
  text: string
  isBold: boolean
  imageBase64: string | null
  lineNumber: number
}

// ─── MAIN PARSER ─────────────────────────────────────────────────────────────

/**
 * Parse a .docx file buffer into structured question objects.
 *
 * @param buffer - ArrayBuffer of the .docx file
 * @returns ParseResult with success flag, questions array, and errors array
 */
export async function parseDocx(buffer: ArrayBuffer): Promise<ParseResult> {
  const errors: ParseError[] = []
  const questions: ParsedQuestion[] = []

  // ─── STEP 1: Extract raw paragraphs with Mammoth ───────────────────────────

  let rawParagraphs: RawParagraph[]

  try {
    rawParagraphs = await extractParagraphs(buffer)
  } catch (err) {
    return {
      success: false,
      questions: [],
      errors: [
        {
          line: 0,
          message: `Không thể đọc file .docx: ${err instanceof Error ? err.message : 'Lỗi không xác định'}`,
        },
      ],
    }
  }

  return parseRawParagraphs(rawParagraphs)
}

export function parseRawParagraphs(rawParagraphs: RawParagraph[]): ParseResult {
  const errors: ParseError[] = []
  const questions: ParsedQuestion[] = []
  let currentModule: string | null = null
  let i = 0

  while (i < rawParagraphs.length) {
    const para = rawParagraphs[i]
    const trimmed = para.text.trim()

    // Skip blank lines
    if (!trimmed && !para.imageBase64) {
      i++
      continue
    }

    // ── Module heading ──────────────────────────────────────────────────────
    if (para.isBold && isModuleHeading(trimmed)) {
      const moduleName = extractModuleName(trimmed)
      if (!VALID_MODULES.includes(moduleName as typeof VALID_MODULES[number])) {
        errors.push({
          line: para.lineNumber,
          message: `Tên module không hợp lệ: "${moduleName}". Module hợp lệ: ${VALID_MODULES.join(', ')}`,
        })
      } else {
        currentModule = moduleName
      }
      i++
      continue
    }

    // ── Question start ──────────────────────────────────────────────────────
    if (para.isBold && isQuestionHeading(trimmed)) {
      // Collect all paragraphs belonging to this question
      const { question, nextIndex, parseErrors } = parseQuestion(
        rawParagraphs,
        i,
        currentModule ?? DEFAULT_MODULE
      )

      parseErrors.forEach((e) => errors.push(e))

      if (question) {
        questions.push(question)
      }

      i = nextIndex
      continue
    }

    // Any other non-blank line outside a question block → skip silently
    i++
  }

  // ─── STEP 3: If any errors, return failure (never partially save) ──────────

  if (errors.length > 0) {
    return { success: false, questions: [], errors }
  }

  if (questions.length === 0) {
    return {
      success: false,
      questions: [],
      errors: [{ line: 0, message: 'File không chứa câu hỏi nào hợp lệ.' }],
    }
  }

  return { success: true, questions, errors: [] }
}

export function parseTextQuestions(text: string): ParseResult {
  const rawParagraphs = text
    .split(/\r?\n/)
    .map((line, idx): RawParagraph | null => {
      const trimmed = line.trim()
      if (!trimmed) return null

      const boldMatch = /^\*\*(.+)\*\*$/.exec(trimmed)
      if (boldMatch) {
        return {
          text: boldMatch[1].trim(),
          isBold: true,
          imageBase64: null,
          lineNumber: idx + 1,
        }
      }

      const boldOptionMatch = /^-\s*\*\*([A-D][).]\s+.+)\*\*$/i.exec(trimmed)
      if (boldOptionMatch) {
        return {
          text: `- ${boldOptionMatch[1].replace(/^([A-D])\./i, '$1)').trim()}`,
          isBold: true,
          imageBase64: null,
          lineNumber: idx + 1,
        }
      }

      return {
        text: trimmed.replace(/^-\s*([A-D])\./i, '- $1)'),
        isBold: isModuleHeading(trimmed) || isQuestionHeading(trimmed),
        imageBase64: null,
        lineNumber: idx + 1,
      }
    })
    .filter((line): line is RawParagraph => Boolean(line))

  return parseRawParagraphs(rawParagraphs)
}

// ─── PARAGRAPH EXTRACTOR ─────────────────────────────────────────────────────
//
// Mammoth converts .docx to HTML where:
//   • <p>          → module headings / question headings
//   • <ul><li>     → question field items (Text:, Question:, Options:, Answer:)
//   • nested <ul>  → individual answer options (A/B/C/D)
//
// We walk the HTML in document order and emit RawParagraph objects so the
// existing parseQuestion() logic can consume them unchanged.

async function extractParagraphs(buffer: ArrayBuffer): Promise<RawParagraph[]> {
  // Mammoth 1.x only accepts a Node.js Buffer via the `buffer` key.
  // Passing `{ arrayBuffer }` throws "Could not find file in options".
  const nodeBuffer = Buffer.from(buffer)

  const result = await mammoth.convertToHtml(
    { buffer: nodeBuffer },
    {
      convertImage: mammoth.images.imgElement((image) =>
        image.read('base64').then((imageBuffer) => ({
          src: `data:${image.contentType};base64,${imageBuffer}`,
        }))
      ),
    }
  )

  return parseHtml(result.value)
}

// ── HTML → RawParagraph[] ─────────────────────────────────────────────────────

function parseHtml(html: string): RawParagraph[] {
  const paras: RawParagraph[] = []
  let lineNum = 0

  /** Strip all HTML tags, return plain text */
  const strip = (h: string) => h.replace(/<[^>]+>/g, '').trim()

  /** True when every non-whitespace character is wrapped in <strong>/<b> */
  const isAllBold = (h: string): boolean => {
    const text = strip(h)
    if (!text) return false
    const sans = h
      .replace(/<strong[^>]*>[\s\S]*?<\/strong>/gi, '')
      .replace(/<b[^>]*>[\s\S]*?<\/b>/gi, '')
    return strip(sans).length === 0
  }

  /**
   * Find the index of the closing tag that matches the opening tag whose
   * content starts at `afterOpen`. Handles same-tag nesting.
   * Returns the index of the start of the matching close tag.
   */
  function findClose(src: string, afterOpen: number, tag: string): number {
    const open  = `<${tag}`
    const close = `</${tag}>`
    let depth = 1
    let i = afterOpen
    while (i < src.length && depth > 0) {
      if (src.startsWith(close, i)) {
        if (--depth === 0) return i
        i += close.length
      } else if (src.startsWith(open, i) && /[\s>]/.test(src[i + open.length] ?? '')) {
        depth++
        i++
      } else {
        i++
      }
    }
    return i // end-of-string fallback
  }

  /** Parse individual option <li> items inside the nested Options <ul> */
  function parseOptions(ulInner: string): void {
    let p = 0
    while (p < ulInner.length) {
      if (ulInner.startsWith('<li', p)) {
        const innerStart = ulInner.indexOf('>', p) + 1
        const closeIdx   = findClose(ulInner, innerStart, 'li')
        const liInner    = ulInner.slice(innerStart, closeIdx)
        const text       = strip(liInner)
        const bold       = isAllBold(liInner)
        const imgM       = /<img[^>]+src="([^"]+)"/i.exec(liInner)
        if (text || imgM) {
          lineNum++
          paras.push({ text: `- ${text}`, isBold: bold, imageBase64: imgM?.[1] ?? null, lineNumber: lineNum })
        }
        p = closeIdx + 5 // skip </li>
      } else {
        p++
      }
    }
  }

  /**
   * Process one field <li> from the question body.
   * Handles both bold-colon variants:
   *   <strong>Text:</strong> content
   *   <strong>Text</strong>: content
   *
   * Returns true if the item was recognised as a structured field, false if it
   * was plain text (caller will emit it as a raw paragraph for metadata parsing).
   */
  function parseFieldLi(liInner: string): boolean {
    lineNum++
    // Match field name, colon may be inside or outside the <strong> tag
    const fieldRe = /<strong[^>]*>(Text|Question|Options|Answer):?<\/strong>:?\s*/i
    const fieldM  = fieldRe.exec(liInner)
    if (!fieldM) return false // not a recognised structured field

    const fieldName  = fieldM[1]  // Text | Question | Options | Answer
    const afterField = liInner.slice(fieldM.index + fieldM[0].length)

    if (fieldName === 'Options') {
      // Emit the header line then parse the nested <ul> for A/B/C/D options
      paras.push({ text: '- **Options:**', isBold: false, imageBase64: null, lineNumber: lineNum })
      const ulIdx = afterField.indexOf('<ul')
      if (ulIdx >= 0) {
        const innerStart = afterField.indexOf('>', ulIdx) + 1
        const closeIdx   = findClose(afterField, innerStart, 'ul')
        parseOptions(afterField.slice(innerStart, closeIdx))
      }
    } else {
      // Text / Question / Answer — collapse any nested <li> items into plain text
      const imgM = /<img[^>]+src="([^"]+)"/i.exec(afterField)
      const content = afterField
        .replace(/<\/li>/gi, ' ')   // turn list items into space-separated text
        .replace(/<[^>]+>/g, '')    // strip remaining tags
        .replace(/\s+/g, ' ')
        .trim()

      if (content || imgM) {
        paras.push({
          text: `- **${fieldName}:** ${content}`.trimEnd(),
          isBold: false,
          imageBase64: imgM?.[1] ?? null,
          lineNumber: lineNum,
        })
      }
    }
    return true
  }

  /** Walk direct <li> children of a top-level <ul> */
  function parseTopLevelUl(ulInner: string): void {
    let p = 0
    while (p < ulInner.length) {
      if (ulInner.startsWith('<li', p)) {
        const innerStart = ulInner.indexOf('>', p) + 1
        const closeIdx   = findClose(ulInner, innerStart, 'li')
        const liInner    = ulInner.slice(innerStart, closeIdx)
        const recognised = parseFieldLi(liInner)
        if (!recognised) {
          // Plain-text bullet (difficulty:, skill:, explanation:, etc.)
          // Emit as a raw paragraph so parseRawParagraphs can pick it up.
          const text = strip(liInner)
          if (text) {
            paras.push({ text: `- ${text}`, isBold: false, imageBase64: null, lineNumber: lineNum })
          }
        }
        p = closeIdx + 5 // skip </li>
      } else {
        p++
      }
    }
  }

  // ── Main walk: process top-level <p> and <ul> in document order ───────────

  let pos = 0
  while (pos < html.length) {
    if (html.startsWith('<p', pos)) {
      // Paragraph → module heading or question heading
      const innerStart = html.indexOf('>', pos) + 1
      const closeIdx   = html.indexOf('</p>', innerStart)
      if (closeIdx === -1) { pos++; continue }

      lineNum++
      const inner    = html.slice(innerStart, closeIdx)
      const text     = strip(inner)
      const isBold   = isAllBold(inner)
      const imgM     = /<img[^>]+src="([^"]+)"/i.exec(inner)
      if (text || imgM) {
        paras.push({ text, isBold, imageBase64: imgM?.[1] ?? null, lineNumber: lineNum })
      }
      pos = closeIdx + 4 // skip </p>

    } else if (html.startsWith('<ul', pos)) {
      // Top-level list → question body fields
      const innerStart = html.indexOf('>', pos) + 1
      const closeIdx   = findClose(html, innerStart, 'ul')
      parseTopLevelUl(html.slice(innerStart, closeIdx))
      pos = closeIdx + 5 // skip </ul>

    } else {
      pos++
    }
  }

  return paras
}

// ─── QUESTION PARSER ─────────────────────────────────────────────────────────

interface QuestionParseResult {
  question: ParsedQuestion | null
  nextIndex: number
  parseErrors: ParseError[]
}

function parseQuestion(
  paragraphs: RawParagraph[],
  startIndex: number,
  module: string
): QuestionParseResult {
  const errors: ParseError[] = []
  const startLine = paragraphs[startIndex].lineNumber

  let textContent: string | null = null
  let questionStem: string | null = null
  let imageBase64: string | null = null
  let difficulty: ParsedQuestion['difficulty'] = null
  let teacherExplanation: string | null = null
  let category: string | null = null
  let inOptions = false
  let hasAnswerField = false
  const options: ParsedOption[] = []
  const acceptedAnswers: string[] = []

  let i = startIndex + 1  // skip "**Question N**" line

  while (i < paragraphs.length) {
    const para = paragraphs[i]
    const trimmed = para.text.trim()

    // Stop at next question heading or module heading
    if (para.isBold && (isQuestionHeading(trimmed) || isModuleHeading(trimmed))) {
      break
    }

    // Skip blank lines
    if (!trimmed && !para.imageBase64) {
      i++
      continue
    }

    // ── Image ────────────────────────────────────────────────────────────────
    if (para.imageBase64) {
      imageBase64 = para.imageBase64
      i++
      continue
    }

    // ── Text field: "- **Text:** ..." ────────────────────────────────────────
    if (trimmed.startsWith('- **Text:**') || trimmed.startsWith('-  **Text:**')) {
      textContent = trimmed.replace(/^-\s+\*\*Text:\*\*\s*/i, '').trim()
      i++
      // Collect multi-line text
      while (i < paragraphs.length) {
        const next = paragraphs[i]
        const nextTrimmed = next.text.trim()
        if (!nextTrimmed || isFieldMarker(nextTrimmed) || next.isBold) break
        textContent += ' ' + nextTrimmed
        i++
      }
      continue
    }

    // ── Question stem: "- **Question:** ..." ────────────────────────────────
    if (trimmed.startsWith('- **Question:**') || trimmed.startsWith('-  **Question:**')) {
      questionStem = trimmed.replace(/^-\s+\*\*Question:\*\*\s*/i, '').trim()
      i++
      // Collect multi-line question stem
      while (i < paragraphs.length) {
        const next = paragraphs[i]
        const nextTrimmed = next.text.trim()
        if (!nextTrimmed || isFieldMarker(nextTrimmed) || next.isBold) break
        questionStem += ' ' + nextTrimmed
        i++
      }
      continue
    }

    // ── Options section header: "- **Options:**" ────────────────────────────
    if (trimmed.startsWith('- **Options:**') || trimmed === '- **Options:**') {
      inOptions = true
      i++
      continue
    }

    // ── Answer field (short answer): "- **Answer:** ..." ────────────────────
    if (trimmed.startsWith('- **Answer:**') || trimmed.startsWith('-  **Answer:**')) {
      hasAnswerField = true
      const answerText = trimmed.replace(/^-\s+\*\*Answer:\*\*\s*/i, '').trim()
      // Split on " | " to get multiple accepted variants. For PDF/plain-text
      // multiple choice, this can be "A" or the full correct option text.
      const variants = answerText.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean)
      acceptedAnswers.push(...variants)
      i++
      continue
    }

    // ── Optional metadata: difficulty/category/explanation ─────────────────
    if (
      /^-\s+\*\*Difficulty:\*\*/i.test(trimmed) ||
      /^Difficulty\s*:/i.test(trimmed) ||
      /^-\s+difficulty\s*:/i.test(trimmed)
    ) {
      difficulty = normalizeDifficulty(
        trimmed
          .replace(/^-\s+\*\*Difficulty:\*\*\s*/i, '')
          .replace(/^Difficulty\s*:\s*/i, '')
          .replace(/^-\s+difficulty\s*:\s*/i, '')
      )
      i++
      continue
    }

    if (
      /^-\s+\*\*(Category|Tag|Skill):\*\*/i.test(trimmed) ||
      /^(Category|Tag|Skill)\s*:/i.test(trimmed) ||
      /^-\s+(category|tag|skill)\s*:/i.test(trimmed)
    ) {
      category = trimmed
        .replace(/^-\s+\*\*(Category|Tag|Skill):\*\*\s*/i, '')
        .replace(/^(Category|Tag|Skill)\s*:\s*/i, '')
        .replace(/^-\s+(category|tag|skill)\s*:\s*/i, '')
        .trim() || null
      i++
      continue
    }

    if (/^-\s+\*\*(Explanation|Explaination|Rationale):\*\*/i.test(trimmed) || /^(Explanation|Explaination|Rationale)\s*:/i.test(trimmed)) {
      teacherExplanation = trimmed
        .replace(/^-\s+\*\*(Explanation|Explaination|Rationale):\*\*\s*/i, '')
        .replace(/^(Explanation|Explaination|Rationale)\s*:\s*/i, '')
        .trim()
      i++
      while (i < paragraphs.length) {
        const next = paragraphs[i]
        const nextTrimmed = next.text.trim()
        if (!nextTrimmed || isFieldMarker(nextTrimmed) || next.isBold) break
        teacherExplanation += ' ' + nextTrimmed
        i++
      }
      teacherExplanation = teacherExplanation.trim() || null
      continue
    }

    // ── Individual option line: "- A) text" or "- **A) text**" ─────────────
    if (inOptions && /^-\s+[A-D]\)/.test(trimmed)) {
      const optionMatch = /^-\s+([A-D])\)\s+(.+)$/.exec(trimmed)
      if (optionMatch) {
        options.push({
          label: optionMatch[1],
          content: optionMatch[2].trim(),
          isCorrect: para.isBold,
        })
      } else {
        errors.push({
          line: para.lineNumber,
          message: `Định dạng đáp án sai tại dòng ${para.lineNumber}: "${trimmed}"`,
        })
      }
      i++
      continue
    }

    i++
  }

  // ─── Validation ────────────────────────────────────────────────────────────

  if (!questionStem) {
    errors.push({
      line: startLine,
      message: `Câu hỏi tại dòng ${startLine} thiếu trường "- **Question:**"`,
    })
    return { question: null, nextIndex: i, parseErrors: errors }
  }

  if (options.length > 0 && acceptedAnswers.length > 0 && options.every((o) => !o.isCorrect)) {
    const explicitAnswer = acceptedAnswers[0].trim()
    const explicitLabel = /^[A-D]$/i.test(explicitAnswer) ? explicitAnswer.toUpperCase() : null
    for (const option of options) {
      if (option.label === explicitLabel || option.content.trim() === explicitAnswer) {
        option.isCorrect = true
      }
    }
  }

  const isMultipleChoice = options.length > 0
  const isShortAnswer = hasAnswerField && options.length === 0

  if (isMultipleChoice) {
    if (options.length !== 4) {
      errors.push({
        line: startLine,
        message: `Câu hỏi tại dòng ${startLine} phải có đúng 4 đáp án (hiện có ${options.length}).`,
      })
      return { question: null, nextIndex: i, parseErrors: errors }
    }

    const correctOptions = options.filter((o) => o.isCorrect)
    if (correctOptions.length === 0) {
      errors.push({
        line: startLine,
        message: `Câu hỏi tại dòng ${startLine} chưa có đáp án đúng được in đậm.`,
      })
      return { question: null, nextIndex: i, parseErrors: errors }
    }

    if (correctOptions.length > 1) {
      errors.push({
        line: startLine,
        message: `Câu hỏi tại dòng ${startLine} có nhiều hơn 1 đáp án đúng (${correctOptions.map((o) => o.label).join(', ')}).`,
      })
      return { question: null, nextIndex: i, parseErrors: errors }
    }
  }

  if (isShortAnswer && acceptedAnswers.length === 0) {
    errors.push({
      line: startLine,
      message: `Câu hỏi trả lời ngắn tại dòng ${startLine} thiếu trường "- **Answer:**"`,
    })
    return { question: null, nextIndex: i, parseErrors: errors }
  }

  // ─── Build content hash ────────────────────────────────────────────────────

  const correctAnswer = isMultipleChoice
    ? options.find((o) => o.isCorrect)?.content ?? ''
    : acceptedAnswers[0] ?? ''

  const contentHash = generateContentHash(questionStem, correctAnswer)

  // ─── Build full question content (passage + stem) ─────────────────────────

  const fullContent = [textContent, questionStem].filter(Boolean).join('\n\n')

  const question: ParsedQuestion = {
    type: isMultipleChoice ? 'multiple_choice' : 'short_answer',
    module,
    content: fullContent,
    questionStem,
    options: isMultipleChoice ? options : [],
    acceptedAnswers: isShortAnswer ? acceptedAnswers : [],
    imageBase64,
    contentHash,
    difficulty,
    teacherExplanation,
    category,
  }

  return { question, nextIndex: i, parseErrors: errors }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function isModuleHeading(text: string): boolean {
  return /^Module\s+\d+\s*:/i.test(text)
}

function isQuestionHeading(text: string): boolean {
  return /^Question\s+\d+$/i.test(text)
}

function extractModuleName(text: string): string {
  // e.g. "Module 1: Reading and Writing" → "Module 1: Reading and Writing"
  return text.trim()
}

function isFieldMarker(text: string): boolean {
  return (
    /^-\s+\*\*(Text|Question|Options|Answer|Difficulty|Category|Tag|Skill|Explanation|Explaination|Rationale):\*\*/.test(text) ||
    /^(Difficulty|Category|Tag|Skill|Explanation|Explaination|Rationale)\s*:/i.test(text) ||
    /^-\s+(difficulty|category|tag|skill|explanation)\s*:/i.test(text)
  )
}

function normalizeDifficulty(value: string): ParsedQuestion['difficulty'] {
  const normalized = value.trim().toLowerCase()
  if (['easy', 'dễ', 'de'].includes(normalized)) return 'easy'
  if (['medium', 'trung bình', 'tb'].includes(normalized)) return 'medium'
  if (['hard', 'khó', 'kho'].includes(normalized)) return 'hard'
  return null
}
