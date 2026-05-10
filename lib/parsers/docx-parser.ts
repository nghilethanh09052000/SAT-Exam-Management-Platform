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

// ─── INTERNAL PARAGRAPH TYPE ─────────────────────────────────────────────────

interface RawParagraph {
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

  // ─── STEP 2: Parse paragraphs into question blocks ────────────────────────

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
      if (!currentModule) {
        errors.push({
          line: para.lineNumber,
          message: `Câu hỏi xuất hiện trước khi có tiêu đề module. Vui lòng thêm tiêu đề module trước câu hỏi đầu tiên.`,
        })
        i++
        continue
      }

      // Collect all paragraphs belonging to this question
      const { question, nextIndex, parseErrors } = parseQuestion(
        rawParagraphs,
        i,
        currentModule
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

// ─── PARAGRAPH EXTRACTOR ─────────────────────────────────────────────────────

async function extractParagraphs(buffer: ArrayBuffer): Promise<RawParagraph[]> {
  const paragraphs: RawParagraph[] = []
  let lineNumber = 0
  const imageMap = new Map<string, string>() // relationshipId → base64

  // Transform images to base64 data URIs
  const result = await mammoth.convertToHtml(
    { arrayBuffer: buffer },
    {
      convertImage: mammoth.images.imgElement((image) => {
        return image.read('base64').then((imageBuffer) => {
          const base64 = `data:${image.contentType};base64,${imageBuffer}`
          return { src: base64 }
        })
      }),
    }
  )

  // Also extract raw paragraphs with bold detection
  const rawResult = await (mammoth as unknown as {
    extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
  }).extractRawText({ arrayBuffer: buffer })

  // Use messages API to get paragraph-level data
  // Mammoth doesn't expose paragraph-level bold cleanly via convertToHtml,
  // so we use a custom style map approach with the HTML output.
  const html = result.value

  // Parse the HTML to extract paragraph data
  // We detect bold by checking for <strong> or <b> tags wrapping the full paragraph text
  const paraRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi
  let match: RegExpExecArray | null

  while ((match = paraRegex.exec(html)) !== null) {
    lineNumber++
    const innerHtml = match[1]

    // Extract plain text
    const plainText = innerHtml.replace(/<[^>]+>/g, '').trim()

    // Check if entire paragraph is bold (all text is inside <strong> or <b>)
    const withoutBold = innerHtml.replace(/<strong[^>]*>[\s\S]*?<\/strong>/gi, '')
      .replace(/<b[^>]*>[\s\S]*?<\/b>/gi, '')
    const remainingText = withoutBold.replace(/<[^>]+>/g, '').trim()
    const isBold = plainText.length > 0 && remainingText.length === 0

    // Check for image
    const imgMatch = /<img[^>]+src="([^"]+)"/i.exec(innerHtml)
    const imageBase64 = imgMatch ? imgMatch[1] : null

    paragraphs.push({
      text: plainText,
      isBold,
      imageBase64,
      lineNumber,
    })
  }

  void rawResult // suppress unused warning — used for future error messages
  void imageMap  // suppress unused warning

  return paragraphs
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
      // Split on " | " to get multiple accepted variants
      const variants = answerText.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean)
      acceptedAnswers.push(...variants)
      i++
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

  const isMultipleChoice = !hasAnswerField
  const isShortAnswer = hasAnswerField

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
  return /^-\s+\*\*(Text|Question|Options|Answer):\*\*/.test(text)
}
