/**
 * Extracts text from text-based PDFs and parses questions using the same
 * template markers as the DOCX importer.
 */

// pdfjs-dist v5+ references `DOMMatrix` (a browser CSSOM API) even during text
// extraction. It is not a Node.js global, so we provide a minimal stub before
// pdf-parse is require()-d.  The stub implements the identity matrix and the
// subset of the DOMMatrix API that pdfjs uses for CTM composition; for our
// text-only extraction path the exact numeric values don't matter.
if (typeof globalThis.DOMMatrix === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
    m11 = 1; m12 = 0; m13 = 0; m14 = 0
    m21 = 0; m22 = 1; m23 = 0; m24 = 0
    m31 = 0; m32 = 0; m33 = 1; m34 = 0
    m41 = 0; m42 = 0; m43 = 0; m44 = 1
    is2D = true; isIdentity = true

    constructor(_init?: string | number[]) {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    multiply(_other?: any) { return this }
    translate(_tx = 0, _ty = 0, _tz = 0) { return this }
    scale(_sx = 1, _sy?: number, _sz?: number, _ox?: number, _oy?: number, _oz?: number) { return this }
    scale3d(_s = 1, _ox?: number, _oy?: number, _oz?: number) { return this }
    rotate(_rotX = 0, _rotY?: number, _rotZ?: number) { return this }
    rotateAxisAngle(_x = 0, _y = 0, _z = 0, _angle = 0) { return this }
    rotateFromVector(_x = 0, _y = 0) { return this }
    skewX(_sx = 0) { return this }
    skewY(_sy = 0) { return this }
    flipX() { return this }
    flipY() { return this }
    inverse() { return this }
    invertSelf() { return this }
    multiplySelf(_other?: unknown) { return this }
    preMultiplySelf(_other?: unknown) { return this }
    translateSelf(_tx = 0, _ty = 0, _tz = 0) { return this }
    scaleSelf(_sx = 1) { return this }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transformPoint(point?: any) { return point ?? { x: 0, y: 0, z: 0, w: 1 } }
    toFloat32Array() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]) }
    toFloat64Array() { return new Float64Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]) }
    toString() { return 'matrix(1, 0, 0, 1, 0, 0)' }
    toJSON() { return { a:1,b:0,c:0,d:1,e:0,f:0,m11:1,m12:0,m13:0,m14:0,m21:0,m22:1,m23:0,m24:0,m31:0,m32:0,m33:1,m34:0,m41:0,m42:0,m43:0,m44:1,is2D:true,isIdentity:true } }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static fromMatrix(_other?: any) { return new (globalThis as any).DOMMatrix() }
    static fromFloat32Array(_a32: Float32Array) { return new (globalThis as any).DOMMatrix() }
    static fromFloat64Array(_a64: Float64Array) { return new (globalThis as any).DOMMatrix() }
  }
}

import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { parseTextQuestions } from './docx-parser'
import { generateContentHash } from '@/lib/utils/hash'
import type { ParsedOption, ParsedQuestion, ParseResult, QuestionDifficulty } from '@/types'

const DEFAULT_MODULE = 'Bài thi'
const execFileAsync = promisify(execFile)
type QuestionImageMap = Map<string, string[]>

export async function parsePdf(buffer: ArrayBuffer): Promise<ParseResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse } = require('pdf-parse') as typeof import('pdf-parse')
    const parser = new PDFParse({ data: Buffer.from(buffer) })
    const result = await parser.getText()
    await parser.destroy()

    // Normalise form-feed characters (\x0c, used as page separators) to
    // newlines so that all downstream regex anchors (^/$) work correctly.
    const text = result.text.replace(/\x0c/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    const pageTexts = result.pages?.map((page) =>
      (page.text ?? '').replace(/\x0c/g, '\n')
    ) ?? []

    if (!text) {
      return {
        success: false,
        questions: [],
        errors: [
          {
            line: 0,
            message: 'PDF không có text để phân tích. Vui lòng dùng PDF có text hoặc tải file .docx.',
          },
        ],
      }
    }

    // Extract embedded images up-front so every parser can attach them.
    // This is best-effort: if pdfimages is unavailable it returns an empty map.
    const questionImages = await extractQuestionImages(Buffer.from(buffer), pageTexts)

    if (isSatExportText(text)) {
      return parseSatExportText(text, questionImages)
    }

    const templateResult = parseTextQuestions(text)
    if (templateResult.success) return templateResult

    const previewResult = parseRealExamPreviewText(text, questionImages)
    if (previewResult.success) return previewResult

    const templateIssue = detectPdfTemplateIssue(text)
    if (templateIssue) {
      return {
        success: false,
        questions: [],
        errors: [{ line: 0, message: templateIssue }],
      }
    }

    const satExportResult = parseSatExportText(text, questionImages)
    if (satExportResult.success) return satExportResult

    return templateResult
  } catch (err) {
    return {
      success: false,
      questions: [],
      errors: [
        {
          line: 0,
          message: `Không thể đọc file PDF: ${err instanceof Error ? err.message : 'Lỗi không xác định'}`,
        },
      ],
    }
  }
}

function parseRealExamPreviewText(
  text: string,
  questionImages: QuestionImageMap = new Map()
): ParseResult {
  if (/\n\s*Answer Key\s*\n/i.test(text)) {
    return {
      success: false,
      questions: [],
      errors: [{ line: 0, message: 'PDF có Answer Key nhưng không khớp định dạng preview không đáp án.' }],
    }
  }

  const normalized = text
    .replace(/\r/g, '')
    .replace(/^--\s*\d+\s+of\s+\d+\s*--$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const lines = normalized.split(/\n/)
  const title = lines.find((line) => line.trim())?.trim() ?? ''
  const subject = /math/i.test(title) ? 'Math' : 'Reading and Writing'
  const module = `Module 1: ${subject}`
  const declaredQuestionCount = Number((/^(\d+)\s+questions\s*$/im.exec(normalized)?.[1]) ?? NaN)
  const questionStarts = extractSequentialQuestionStarts(normalized, declaredQuestionCount)

  if (questionStarts.length < 2) {
    return {
      success: false,
      questions: [],
      errors: [{ line: 0, message: 'PDF không đủ câu hỏi đánh số để tạo bản xem trước.' }],
    }
  }

  const questions: ParsedQuestion[] = []
  for (let idx = 0; idx < questionStarts.length; idx++) {
    const current = questionStarts[idx]
    const next = questionStarts[idx + 1]
    const block = normalized.slice(current.index + current.text.length, next?.index ?? normalized.length).trim()
    // Look up images by question number; bluebooky PDFs use DEFAULT_MODULE as the key.
    const imageDataUrls =
      questionImages.get(answerKeyId(DEFAULT_MODULE, current.number)) ?? []
    const parsed = parseRealExamPreviewBlock(block, current.number, module, imageDataUrls)
    if (parsed) questions.push(parsed)
  }

  if (questions.length === 0) {
    return {
      success: false,
      questions: [],
      errors: [{ line: 0, message: 'PDF không chứa câu hỏi có thể xem trước.' }],
    }
  }

  return { success: true, questions, errors: [] }
}

function parseRealExamPreviewBlock(
  block: string,
  questionNumber: number,
  module: string,
  imageDataUrls: string[] = []
): ParsedQuestion | null {
  const lines = block
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return null

  const shortAnswerIndex = lines.findIndex((line) => /^Student-produced response$/i.test(line))
  if (shortAnswerIndex >= 0) {
    const rawContent = cleanWhitespace(lines.slice(0, shortAnswerIndex).join('\n'))
    const content = withQuestionImages(rawContent, imageDataUrls)
    if (!rawContent) return null
    return {
      type: 'short_answer',
      module,
      content,
      questionStem: rawContent,
      options: [],
      acceptedAnswers: [],
      imageBase64: imageDataUrls[0] ?? null,
      contentHash: generateContentHash(rawContent, `missing-answer-${questionNumber}`),
      difficulty: null,
      teacherExplanation: null,
      category: null,
    }
  }

  const optionStarts = findRealExamOptionStarts(lines)
  if (optionStarts.length >= 4) {
    const firstOptionLine = optionStarts[0].lineIndex
    const rawContent = cleanWhitespace(lines.slice(0, firstOptionLine).join('\n'))
    if (!rawContent) return null
    const content = withQuestionImages(rawContent, imageDataUrls)

    const options = optionStarts.slice(0, 4).map((start, idx): ParsedOption => {
      const end = optionStarts[idx + 1]?.lineIndex ?? lines.length
      const inline = start.inlineContent
      const following = lines.slice(start.lineIndex + 1, end)
      const optionContent = cleanWhitespace([inline, ...following].join('\n'))
      return {
        label: start.label,
        content: optionContent || `[Option ${start.label} needs review from PDF]`,
        isCorrect: false,
      }
    })

    return {
      type: 'multiple_choice',
      module,
      content,
      questionStem: rawContent,
      options,
      acceptedAnswers: [],
      imageBase64: imageDataUrls[0] ?? null,
      contentHash: generateContentHash(rawContent, `missing-correct-answer-${questionNumber}`),
      difficulty: null,
      teacherExplanation: null,
      category: null,
    }
  }

  return null
}

function extractSequentialQuestionStarts(text: string, declaredQuestionCount: number) {
  const candidates = Array.from(text.matchAll(/^(\d{1,3})\s*$/gm))
    .map((match) => ({ number: Number(match[1]), index: match.index ?? 0, text: match[0] }))
    .filter((match) => match.number >= 1)

  const starts: { number: number; index: number; text: string }[] = []
  let expected = 1
  for (const candidate of candidates) {
    if (candidate.number !== expected) continue
    starts.push(candidate)
    expected++
    if (Number.isFinite(declaredQuestionCount) && starts.length >= declaredQuestionCount) break
  }
  return starts
}

function findRealExamOptionStarts(lines: string[]) {
  const starts: { label: string; inlineContent: string; lineIndex: number }[] = []
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const match = /^([A-D])(?:[).]|\s+)(.*)$/.exec(lines[lineIndex])
      ?? /^([A-D])$/.exec(lines[lineIndex])
    if (!match) continue

    const label = match[1]
    const expected = String.fromCharCode('A'.charCodeAt(0) + starts.length)
    if (label !== expected) continue

    starts.push({
      label,
      inlineContent: match[2]?.trim() ?? '',
      lineIndex,
    })
    if (starts.length === 4) break
  }
  return starts
}

function detectPdfTemplateIssue(text: string): string | null {
  const hasAnswerKey = /\n\s*Answer Key\s*\n/i.test(text)
  const hasNumberedQuestions = /^1\s*$/m.test(text) && /^2\s*$/m.test(text)
  const hasChoiceLabels = /^\s*A(?:[).]|\s*$)/m.test(text)
    && /^\s*B(?:[).]|\s*$)/m.test(text)
    && /^\s*C(?:[).]|\s*$)/m.test(text)
    && /^\s*D(?:[).]|\s*$)/m.test(text)
  const hasAcceptedModule = /^(?:Module\s+\d+\s*:\s*(?:Reading and Writing|Math)|(?:Reading\s*&\s*Writing|Reading\s+and\s+Writing|Math)\s*-\s*Module\s*\d+)\s*$/im.test(text)

  if ((hasNumberedQuestions || hasChoiceLabels) && !hasAnswerKey) {
    return 'PDF có vẻ là đề thi thật nhưng thiếu phần "Answer Key" ở cuối file, nên hệ thống không thể xác định đáp án đúng. Vui lòng dùng PDF theo PDF-TEMPLATE.md hoặc tải file .docx theo DOCX-TEMPLATE.md.'
  }

  if (hasAnswerKey && !hasAcceptedModule) {
    return 'PDF có Answer Key nhưng thiếu heading module hợp lệ. Vui lòng dùng các heading như "Module 1: Reading and Writing", "Module 2: Reading and Writing", "Module 1: Math", hoặc "Module 2: Math".'
  }

  return null
}

function isSatExportText(text: string): boolean {
  return /^(Reading\s*&\s*Writing|Reading\s+and\s+Writing|Math)\s*-\s*Module\s*\d+\s*$/im.test(text)
    && /^Question\s+\d+\s*$/im.test(text)
    && /^category\s*:/im.test(text)
    && /^Difficulty\s*:/im.test(text)
}

export function parseSatExportText(text: string, questionImages: QuestionImageMap = new Map()): ParseResult {
  const errors: ParseResult['errors'] = []
  const answerKey = extractAnswerKey(text)
  const mainText = text.split(/\n\s*Answer Key\s*\n/i)[0] ?? text
  const questionMatches = Array.from(mainText.matchAll(/^Question\s+(\d+)\s*$/gim))
  const questions: ParsedQuestion[] = []

  if (questionMatches.length === 0) {
    return {
      success: false,
      questions: [],
      errors: [{ line: 0, message: 'PDF không chứa câu hỏi theo định dạng SAT export.' }],
    }
  }

  let currentModule = DEFAULT_MODULE

  for (let idx = 0; idx < questionMatches.length; idx++) {
    const match = questionMatches[idx]
    const questionNumber = Number(match[1])
    const blockStart = (match.index ?? 0) + match[0].length
    const blockEnd = idx + 1 < questionMatches.length
      ? questionMatches[idx + 1].index ?? mainText.length
      : mainText.length
    const beforeQuestion = mainText.slice(0, match.index ?? 0)
    currentModule = findNearestModule(beforeQuestion) ?? currentModule

    const parsed = parseSatQuestionBlock({
      block: mainText.slice(blockStart, blockEnd),
      questionNumber,
      module: currentModule,
      answerKey,
      imageDataUrls: questionImages.get(answerKeyId(currentModule, questionNumber)) ?? [],
      line: lineNumberAt(mainText, match.index ?? 0),
    })

    if (parsed.question) questions.push(parsed.question)
    errors.push(...parsed.errors)
  }

  if (questions.length === 0) {
    return {
      success: false,
      questions: [],
      errors: errors.length ? errors : [{ line: 0, message: 'File không chứa câu hỏi nào hợp lệ.' }],
    }
  }

  return { success: errors.length === 0, questions: errors.length === 0 ? questions : [], errors }
}

function parseSatQuestionBlock({
  block,
  questionNumber,
  module,
  answerKey,
  imageDataUrls,
  line,
}: {
  block: string
  questionNumber: number
  module: string
  answerKey: Map<string, string>
  imageDataUrls: string[]
  line: number
}): { question: ParsedQuestion | null; errors: ParseResult['errors'] } {
  const errors: ParseResult['errors'] = []
  const category = matchSingleLine(block, /^category\s*:\s*(.+)$/im)
  const difficulty = normalizeDifficulty(matchSingleLine(block, /^difficulty\s*:\s*(.+)$/im) ?? '')
  const teacherExplanation = matchBlock(
    block,
    /^(?:explanation|explaination|rationale)\s*:\s*([\s\S]*?)(?=\n\s*(?:category|difficulty)\s*:|\n\s*✓\s*Correct|\s*$)/im
  )

  const withoutMetadata = block
    .replace(/^(?:category|difficulty)\s*:.*$/gim, '')
    .replace(/^(?:explanation|explaination|rationale)\s*:[\s\S]*?(?=\n\s*(?:category|difficulty)\s*:|\n\s*✓\s*Correct|\s*$)/gim, '')

  const optionMatches = Array.from(withoutMetadata.matchAll(/^\s*([A-D])(?:[).]|\s+(.+))?\s*$/gm))
  if (optionMatches.length < 4) {
    errors.push({
      line,
      message: `Câu hỏi ${questionNumber} phải có đúng 4 đáp án A-D (hiện có ${optionMatches.length}).`,
    })
    return { question: null, errors }
  }

  const firstOptionIndex = optionMatches[0].index ?? 0
  const content = withQuestionImages(
    cleanQuestionContent(withoutMetadata.slice(0, firstOptionIndex)),
    imageDataUrls
  )
  if (!content) {
    errors.push({ line, message: `Câu hỏi ${questionNumber} thiếu nội dung câu hỏi.` })
    return { question: null, errors }
  }

  const rawOptions = optionMatches.slice(0, 4).map((optionMatch, optionIdx) => {
    const label = optionMatch[1].toUpperCase()
    const inlineContent = optionMatch[2] ?? ''
    const optionStart = (optionMatch.index ?? 0) + optionMatch[0].length
    const optionEnd = optionIdx + 1 < optionMatches.length
      ? optionMatches[optionIdx + 1].index ?? withoutMetadata.length
      : withoutMetadata.length
    const rawContent = `${inlineContent}\n${withoutMetadata.slice(optionStart, optionEnd)}`
    return {
      label,
      content: cleanOptionContent(rawContent),
      hasInlineCorrectMarker: /✓\s*Correct/i.test(rawContent),
    }
  })

  const hasInlineCorrectMarker = rawOptions.some((option) => option.hasInlineCorrectMarker)
  const keyAnswer = answerKey.get(answerKeyId(module, questionNumber))
  const options: ParsedOption[] = rawOptions.map((option) => ({
    label: option.label,
    content: option.content,
    isCorrect: hasInlineCorrectMarker
      ? option.hasInlineCorrectMarker
      : option.label === keyAnswer,
  }))

  if (options.some((option) => !option.content)) {
    errors.push({ line, message: `Câu hỏi ${questionNumber} có đáp án bị trống.` })
    return { question: null, errors }
  }

  const correctOptions = options.filter((option) => option.isCorrect)
  if (correctOptions.length !== 1) {
    errors.push({
      line,
      message: `Câu hỏi ${questionNumber} cần đúng 1 đáp án đúng (hiện có ${correctOptions.length}).`,
    })
    return { question: null, errors }
  }

  return {
    question: {
      type: 'multiple_choice',
      module,
      content,
      questionStem: content,
      options,
      acceptedAnswers: [],
      imageBase64: imageDataUrls[0] ?? null,
      contentHash: generateContentHash(content, correctOptions[0].content),
      difficulty,
      teacherExplanation,
      category,
    },
    errors,
  }
}

function extractAnswerKey(text: string): Map<string, string> {
  const answerKey = new Map<string, string>()
  const answerKeyText = text.split(/\n\s*Answer Key\s*\n/i)[1] ?? ''
  const lines = answerKeyText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  let currentModule = DEFAULT_MODULE

  for (let i = 0; i < lines.length; i++) {
    const moduleMatch = /^(Reading\s*&\s*Writing|Reading\s+and\s+Writing|Math)\s*-\s*Module\s*(\d+)$/i.exec(lines[i])
    if (moduleMatch) {
      const subject = /^math$/i.test(moduleMatch[1]) ? 'Math' : 'Reading and Writing'
      currentModule = `Module ${moduleMatch[2]}: ${subject}`
      continue
    }

    const sameLineMatches = Array.from(lines[i].matchAll(/\bQ\s*(\d+)\s+([A-D])\b/gi))
    if (sameLineMatches.length > 0) {
      for (const match of sameLineMatches) {
        answerKey.set(answerKeyId(currentModule, Number(match[1])), match[2].toUpperCase())
      }
      continue
    }

    const questionOnlyMatch = /^Q\s*(\d+)$/i.exec(lines[i])
    const nextLineAnswer = lines[i + 1]?.match(/^[A-D]$/i)
    if (questionOnlyMatch && nextLineAnswer) {
      answerKey.set(answerKeyId(currentModule, Number(questionOnlyMatch[1])), nextLineAnswer[0].toUpperCase())
      i++
    }
  }

  return answerKey
}

function answerKeyId(module: string, questionNumber: number): string {
  return `${module}::${questionNumber}`
}

function findNearestModule(textBeforeQuestion: string): string | null {
  const matches = Array.from(textBeforeQuestion.matchAll(/^(Reading\s*&\s*Writing|Reading\s+and\s+Writing|Math)\s*-\s*Module\s*(\d+)\s*$/gim))
  const last = matches.at(-1)
  if (!last) return null

  const subject = /^math$/i.test(last[1]) ? 'Math' : 'Reading and Writing'
  return `Module ${last[2]}: ${subject}`
}

function matchSingleLine(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text)
  return match?.[1]?.trim() || null
}

function matchBlock(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text)
  return cleanWhitespace(match?.[1] ?? '') || null
}

function cleanQuestionContent(value: string): string {
  return value
    .replace(/^\s*✓\s*Correct\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .split(/\n/)
    .map((line) => line.trim())
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function withQuestionImages(content: string, imageDataUrls: string[]): string {
  if (imageDataUrls.length === 0) return content

  const imagesHtml = imageDataUrls
    .map((src) => `<p><img src="${src}" alt="Question image" /></p>`)
    .join('')
  const lines = content.split(/\n/)
  if (lines.length <= 1) return `${imagesHtml}${content}`

  return [lines[0], imagesHtml, ...lines.slice(1)].join('\n')
}

function cleanOptionContent(value: string): string {
  return cleanWhitespace(value.replace(/✓\s*Correct/gi, ''))
}

function cleanWhitespace(value: string): string {
  return value
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function normalizeDifficulty(value: string): QuestionDifficulty | null {
  const normalized = value.trim().toLowerCase()
  if (['easy', 'dễ', 'de'].includes(normalized)) return 'easy'
  if (['medium', 'trung bình', 'tb'].includes(normalized)) return 'medium'
  if (['hard', 'khó', 'kho'].includes(normalized)) return 'hard'
  return null
}

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split(/\n/).length
}

async function extractQuestionImages(pdfBuffer: Buffer, pageTexts: string[]): Promise<QuestionImageMap> {
  const questionImages: QuestionImageMap = new Map()
  const workDir = join(tmpdir(), `sat-pdf-images-${randomUUID()}`)

  try {
    await mkdir(workDir, { recursive: true })
    const pdfPath = join(workDir, 'source.pdf')
    const prefix = join(workDir, 'image')
    await writeFile(pdfPath, pdfBuffer)

    const { stdout } = await execFileAsync('pdfimages', ['-list', pdfPath])
    const entries = parsePdfImagesList(stdout)
    if (entries.length === 0) return questionImages

    await execFileAsync('pdfimages', ['-png', pdfPath, prefix])
    const imagesByPage = new Map<number, string[]>()

    for (let idx = 0; idx < entries.length; idx++) {
      // pdfimages names files by the global "num" column, not the filtered array index.
      const imagePath = join(workDir, `image-${String(entries[idx].num).padStart(3, '0')}.png`)
      try {
        const imageBuffer = await readFile(imagePath)
        const dataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`
        const pageImages = imagesByPage.get(entries[idx].page) ?? []
        pageImages.push(dataUrl)
        imagesByPage.set(entries[idx].page, pageImages)
      } catch {
        // Some PDF image encodings may not produce a PNG; skip those gracefully.
      }
    }

    let currentModule = DEFAULT_MODULE
    for (let pageNum = 1; pageNum <= pageTexts.length; pageNum++) {
      const pageText = pageTexts[pageNum - 1] ?? ''
      const module = findNearestModule(pageText)
      if (module) currentModule = module

      const pageImages = imagesByPage.get(pageNum)
      if (!pageImages?.length) continue

      // Primary: SAT export format "Question N"
      let questionMatches = Array.from(pageText.matchAll(/^Question\s+(\d+)\s*$/gim))

      if (questionMatches.length === 0) {
        // Fallback: bluebooky format — bare question number as the first
        // non-empty line on the page (e.g. "140\nGlobal biomass is…").
        const firstNonEmpty = pageText
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.length > 0) ?? ''
        if (/^\d{1,3}$/.test(firstNonEmpty)) {
          const key = answerKeyId(DEFAULT_MODULE, Number(firstNonEmpty))
          questionImages.set(key, [...(questionImages.get(key) ?? []), ...pageImages])
        }
        continue
      }

      if (questionMatches.length !== 1) continue

      const key = answerKeyId(currentModule, Number(questionMatches[0][1]))
      questionImages.set(key, [...(questionImages.get(key) ?? []), ...pageImages])
    }
  } catch {
    // Image extraction is best-effort; text import should still work without poppler/pdfimages.
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }

  return questionImages
}

function parsePdfImagesList(stdout: string) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+\s+\d+\s+image\s+/.test(line))
    .map((line) => {
      const parts = line.split(/\s+/)
      return { page: Number(parts[0]), num: Number(parts[1]) }
    })
    .filter((entry) => Number.isFinite(entry.page) && Number.isFinite(entry.num))
}
