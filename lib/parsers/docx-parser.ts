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

function cleanExtractedText(value: string) {
  return value
    .replace(/\uFEFF/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

// ─── MAIN PARSER ─────────────────────────────────────────────────────────────

/**
 * Parse a .docx file buffer into structured question objects.
 * Auto-detects format: mapped (00000_/00001_/00002_/00006_) or legacy template.
 */
export async function parseDocx(buffer: ArrayBuffer): Promise<ParseResult> {
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

  if (isMappedFormat(rawParagraphs)) {
    const result = parseMappedFormat(rawParagraphs)
    if (result.success) {
      result.latexContent = extractMappedFormatText(rawParagraphs)
    }
    return result
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
        isBold: isModuleHeading(trimmed) || isQuestionHeading(trimmed) || /^00000_Question_\d+/.test(cleanExtractedText(trimmed)),
        imageBase64: null,
        lineNumber: idx + 1,
      }
    })
    .filter((line): line is RawParagraph => Boolean(line))

  if (isMappedFormat(rawParagraphs)) {
    const result = parseMappedFormat(rawParagraphs)
    if (result.success) result.latexContent = extractMappedFormatText(rawParagraphs)
    return result
  }

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
  const strip = (h: string) => cleanExtractedText(h.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))

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

  function findFirstList(inner: string): { tag: 'ul' | 'ol'; inner: string } | null {
    const candidates = (['ul', 'ol'] as const)
      .map((tag) => ({ tag, index: inner.indexOf(`<${tag}`) }))
      .filter((candidate) => candidate.index >= 0)
      .sort((a, b) => a.index - b.index)

    const first = candidates[0]
    if (!first) return null

    const innerStart = inner.indexOf('>', first.index) + 1
    const closeIdx = findClose(inner, innerStart, first.tag)
    return { tag: first.tag, inner: inner.slice(innerStart, closeIdx) }
  }

  function pushImageAndText({
    text,
    isBold,
    imageBase64,
    lineNumber,
  }: {
    text: string
    isBold: boolean
    imageBase64: string | null
    lineNumber: number
  }) {
    const cleaned = cleanExtractedText(text)
    if (imageBase64) {
      paras.push({ text: '', isBold: false, imageBase64, lineNumber })
    }
    if (cleaned) {
      paras.push({ text: cleaned, isBold, imageBase64: null, lineNumber })
    }
  }

  function tableToHtml(tableInner: string): string {
    const rows: string[] = []
    let rowPos = 0
    while (rowPos < tableInner.length) {
      const rowStart = tableInner.indexOf('<tr', rowPos)
      if (rowStart === -1) break
      const rowInnerStart = tableInner.indexOf('>', rowStart) + 1
      const rowClose = findClose(tableInner, rowInnerStart, 'tr')
      const rowInner = tableInner.slice(rowInnerStart, rowClose)
      const cells: string[] = []
      let cellPos = 0
      while (cellPos < rowInner.length) {
        const tdStart = rowInner.indexOf('<td', cellPos)
        const thStart = rowInner.indexOf('<th', cellPos)
        const starts = [tdStart, thStart].filter((index) => index >= 0).sort((a, b) => a - b)
        const cellStart = starts[0]
        if (cellStart === undefined) break
        const tag = rowInner.startsWith('<th', cellStart) ? 'th' : 'td'
        const cellInnerStart = rowInner.indexOf('>', cellStart) + 1
        const cellClose = findClose(rowInner, cellInnerStart, tag)
        const text = strip(rowInner.slice(cellInnerStart, cellClose))
        cells.push(`<${tag}>${text}</${tag}>`)
        cellPos = cellClose + tag.length + 3
      }
      if (cells.length > 0) rows.push(`<tr>${cells.join('')}</tr>`)
      rowPos = rowClose + 5
    }
    return rows.length > 0 ? `<table>${rows.join('')}</table>` : ''
  }

  /** Parse individual option <li> items inside an Options list. */
  function parseOptions(listInner: string): void {
    let p = 0
    while (p < listInner.length) {
      if (listInner.startsWith('<li', p)) {
        const innerStart = listInner.indexOf('>', p) + 1
        const closeIdx   = findClose(listInner, innerStart, 'li')
        const liInner    = listInner.slice(innerStart, closeIdx)
        const text       = strip(liInner)
        const bold       = isAllBold(liInner)
        const imgM       = /<img[^>]+src="([^"]+)"/i.exec(liInner)
        if (text || imgM) {
          lineNum++
          pushImageAndText({
            text: text ? `- ${text}` : '',
            isBold: bold,
            imageBase64: imgM?.[1] ?? null,
            lineNumber: lineNum,
          })
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
      // Emit the header line then parse the nested list for A/B/C/D options.
      paras.push({ text: '- **Options:**', isBold: false, imageBase64: null, lineNumber: lineNum })
      const nestedList = findFirstList(afterField)
      if (nestedList) parseOptions(nestedList.inner)
    } else {
      // Text / Question / Answer — collapse any nested <li> items into plain text
      const imgM = /<img[^>]+src="([^"]+)"/i.exec(afterField)
      const content = afterField
        .replace(/<\/li>/gi, ' ')   // turn list items into space-separated text
        .replace(/<[^>]+>/g, '')    // strip remaining tags
        .replace(/\s+/g, ' ')
        .trim()

      if (content || imgM) {
        pushImageAndText({
          text: `- **${fieldName}:** ${content}`.trimEnd(),
          isBold: false,
          imageBase64: imgM?.[1] ?? null,
          lineNumber: lineNum,
        })
      }
    }
    return true
  }

  /** Walk direct <li> children of a top-level list. */
  function parseTopLevelList(listInner: string): void {
    let p = 0
    while (p < listInner.length) {
      if (listInner.startsWith('<li', p)) {
        const innerStart = listInner.indexOf('>', p) + 1
        const closeIdx   = findClose(listInner, innerStart, 'li')
        const liInner    = listInner.slice(innerStart, closeIdx)
        const recognised = parseFieldLi(liInner)
        if (!recognised) {
          // Plain-text bullet (difficulty:, skill:, explanation:, etc.)
          // Emit as a raw paragraph so parseRawParagraphs can pick it up.
          const text = strip(liInner)
          if (text) {
            lineNum++
            paras.push({ text: `- ${text}`, isBold: false, imageBase64: null, lineNumber: lineNum })
          }
        }
        p = closeIdx + 5 // skip </li>
      } else {
        p++
      }
    }
  }

  // ── Main walk: process top-level paragraphs, lists, and tables in order ───

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
        pushImageAndText({ text, isBold, imageBase64: imgM?.[1] ?? null, lineNumber: lineNum })
      }
      pos = closeIdx + 4 // skip </p>

    } else if (html.startsWith('<ul', pos) || html.startsWith('<ol', pos)) {
      // Top-level list → question body fields or mapped-format options.
      const tag = html.startsWith('<ul', pos) ? 'ul' : 'ol'
      const innerStart = html.indexOf('>', pos) + 1
      const closeIdx   = findClose(html, innerStart, tag)
      parseTopLevelList(html.slice(innerStart, closeIdx))
      pos = closeIdx + tag.length + 3

    } else if (html.startsWith('<table', pos)) {
      const innerStart = html.indexOf('>', pos) + 1
      const closeIdx = findClose(html, innerStart, 'table')
      const tableHtml = tableToHtml(html.slice(innerStart, closeIdx))
      if (tableHtml) {
        lineNum++
        paras.push({ text: tableHtml, isBold: false, imageBase64: null, lineNumber: lineNum })
      }
      pos = closeIdx + 8

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

// ─── MAPPED FORMAT (00000_/00001_/00002_/00003_/00004_/00005_/00006_) ────────
//
// Each question block looks like:
//   [bold] 00000_Question_N(TestCode)_Category_SC
//   00001_[passage text — may continue on following plain paragraphs]
//   00002_[question stem]
//   00003_[accepted answers for student-produced response, separated by |]
//   00004_[rationale/explanation]
//   00005_[difficulty: easy | medium | hard]
//   00006_[optional junk]
//   [list] option text
//   [list] correct option T (True)    ← suffix marks the correct answer
//   [list] option text
//   [list] option text
//   ==End==

export function isMappedFormat(paras: RawParagraph[]): boolean {
  for (const p of paras) {
    const t = cleanExtractedText(p.text)
    if (!t) continue
    if (/^00000_Question_\d+/.test(t)) return true
    // If it starts with a legacy template marker first, bail out fast
    if (p.isBold && /^Module\s+\d+\s*:|^Question\s+\d+$/.test(t)) return false
  }
  return false
}

export function parseMappedFormat(paras: RawParagraph[]): ParseResult {
  const errors: ParseError[] = []
  const questions: ParsedQuestion[] = []
  let i = 0

  while (i < paras.length) {
    const para = paras[i]
    const text = para.text.trim()

    if (!text && !para.imageBase64) { i++; continue }

    if (para.isBold && /^00000_Question_\d+/.test(text)) {
      const { question, nextIndex, parseErrors } = parseMappedQuestion(paras, i)
      parseErrors.forEach((e) => errors.push(e))
      if (question) questions.push(question)
      i = nextIndex
      continue
    }

    i++
  }

  if (errors.length > 0) return { success: false, questions: [], errors }
  if (questions.length === 0) {
    return {
      success: false,
      questions: [],
      errors: [{ line: 0, message: 'File không chứa câu hỏi nào hợp lệ.' }],
    }
  }
  return { success: true, questions, errors: [] }
}

function parseMappedQuestion(
  paras: RawParagraph[],
  startIndex: number
): QuestionParseResult {
  const errors: ParseError[] = []
  const headerPara = paras[startIndex]
  const headerText = cleanExtractedText(headerPara.text)

  // 00000_Question_N(OptionalTestCode)_Category_SC
  const headerMatch = /^00000_Question_\d+(?:\([^)]*\))?_(.+?)(?:_SC)?$/.exec(headerText)
  const category = headerMatch ? headerMatch[1].trim() : null
  const module = category && isMathMappedCategory(category) ? 'Module 1: Math' : DEFAULT_MODULE

  let imageBase64: string | null = null
  let inOptions = false
  const passageLines: string[] = []
  let questionStem: string | null = null
  let teacherExplanation: string | null = null
  let difficulty: ParsedQuestion['difficulty'] = null
  const acceptedAnswers: string[] = []
  const options: ParsedOption[] = []

  let i = startIndex + 1

  while (i < paras.length) {
    const para = paras[i]
    const raw = cleanExtractedText(para.text)

    // End of this question block
    if (raw === '==End==') { i++; break }
    if (/^00000_Question_\d+/.test(raw)) break

    if (!raw && !para.imageBase64) { i++; continue }

    if (para.imageBase64) {
      imageBase64 = para.imageBase64
      i++; continue
    }

    // 00001_ passage — collect this line and any following plain continuations
    if (raw.startsWith('00001_')) {
      const firstLine = raw.slice(6).trim()
      if (firstLine) passageLines.push(firstLine)
      i++
      while (i < paras.length) {
        const next = paras[i]
        const nextRaw = next.text.trim()
        if (!nextRaw && !next.imageBase64) { i++; continue }
        if (/^00002_|^00003_|^00004_|^00005_|^00006_/.test(nextRaw) || nextRaw === '==End==') break
        if (next.isBold) break
        if (next.imageBase64) { imageBase64 = next.imageBase64; i++; continue }
        passageLines.push(cleanExtractedText(nextRaw))
        i++
      }
      continue
    }

    // 00002_ question stem
    if (raw.startsWith('00002_')) {
      questionStem = raw.slice(6).trim()
      i++; continue
    }

    if (raw.startsWith('00003_')) {
      const answers = raw.slice(6).split(/\s*\|\s*/).map((answer) => answer.trim()).filter(Boolean)
      acceptedAnswers.push(...answers)
      i++; continue
    }

    // 00004_ explanation/rationale — collect this line and continuations.
    if (raw.startsWith('00004_')) {
      const explanationLines: string[] = []
      const firstLine = raw.slice(6).trim()
      if (firstLine) explanationLines.push(firstLine)
      i++
      while (i < paras.length) {
        const next = paras[i]
        const nextRaw = cleanExtractedText(next.text)
        if (!nextRaw && !next.imageBase64) { i++; continue }
        if (/^00000_Question_\d+|^00001_|^00002_|^00003_|^00005_|^00006_/.test(nextRaw) || nextRaw === '==End==') break
        if (next.isBold) break
        explanationLines.push(nextRaw)
        i++
      }
      teacherExplanation = explanationLines.join('\n\n').trim() || null
      continue
    }

    if (raw.startsWith('00005_')) {
      difficulty = normalizeDifficulty(raw.slice(6))
      i++; continue
    }

    // 00006_ options section header (any trailing text on this line is ignored)
    if (raw.startsWith('00006_')) {
      inOptions = true
      i++; continue
    }

    // Option lines — Mammoth list items are prefixed with '- ' by parseHtml
    if (inOptions && raw && !/^0000[123456]_/.test(raw)) {
      const optText = raw.startsWith('- ') ? raw.slice(2).trim() : raw
      // Correct answer has ' T (True)' or 'T (True)' appended at the end
      const isCorrect = /\s?T \(True\)$/.test(optText)
      const content = optText.replace(/\s?T \(True\)$/, '').trim()
      if (content) {
        const label = String.fromCharCode('A'.charCodeAt(0) + options.length)
        options.push({ label, content, isCorrect })
      }
      i++; continue
    }

    i++
  }

  const passage = passageLines.join('\n\n').trim() || null
  const content = [passage, questionStem].filter(Boolean).join('\n\n') || ''
  const stem = questionStem || passage || ''

  if (!stem) {
    errors.push({
      line: headerPara.lineNumber,
      message: `Câu hỏi tại dòng ${headerPara.lineNumber} thiếu nội dung (00001_ và 00002_ đều trống).`,
    })
    return { question: null, nextIndex: i, parseErrors: errors }
  }

  const isShortAnswer = acceptedAnswers.length > 0 && options.length === 0

  if (!isShortAnswer && options.length !== 4) {
    errors.push({
      line: headerPara.lineNumber,
      message: `Câu hỏi tại dòng ${headerPara.lineNumber} có ${options.length} đáp án (cần đúng 4).`,
    })
    return { question: null, nextIndex: i, parseErrors: errors }
  }

  const correctOption = options.find((o) => o.isCorrect)
  const correctAnswer = isShortAnswer
    ? acceptedAnswers[0]
    : correctOption?.content ?? `preview-${startIndex}`
  const contentHash = generateContentHash(stem, correctAnswer)

  return {
    question: {
      type: isShortAnswer ? 'short_answer' : 'multiple_choice',
      module,
      stimulus: passage,
      prompt: questionStem,
      content,
      questionStem: stem,
      options,
      acceptedAnswers,
      imageBase64,
      contentHash,
      difficulty,
      teacherExplanation,
      category,
    },
    nextIndex: i,
    parseErrors: errors,
  }
}

function isMathMappedCategory(category: string): boolean {
  const normalized = category.toLowerCase()
  return (
    normalized === 'math' ||
    normalized.includes('algebra') ||
    normalized.includes('advanced math') ||
    normalized.includes('problem-solving') ||
    normalized.includes('problem solving') ||
    normalized.includes('data analysis') ||
    normalized.includes('geometry') ||
    normalized.includes('trigonometry') ||
    normalized.includes('equation') ||
    normalized.includes('expression') ||
    normalized.includes('function') ||
    normalized.includes('variable') ||
    normalized.includes('linear') ||
    normalized.includes('nonlinear') ||
    normalized.includes('ratio') ||
    normalized.includes('percent') ||
    normalized.includes('probability') ||
    normalized.includes('statistic') ||
    normalized.includes('sample') ||
    normalized.includes('margin of error') ||
    normalized.includes('experiment') ||
    normalized.includes('observational') ||
    normalized.includes('area') ||
    normalized.includes('volume') ||
    normalized.includes('triangle') ||
    normalized.includes('circle')
  )
}

/**
 * Reconstruct the structured LaTeX-style text from extracted mapped-format paragraphs.
 * Strips the '- ' prefix that parseHtml adds to list items, restoring the original format.
 */
export function extractMappedFormatText(paras: RawParagraph[]): string {
  const lines: string[] = []

  for (const para of paras) {
    const text = para.text.trim()
    if (!text) continue
    // List items (option lines) come through parseHtml with a '- ' prefix — strip it
    lines.push(text.startsWith('- ') ? text.slice(2) : text)
  }

  return lines.join('\n')
}
