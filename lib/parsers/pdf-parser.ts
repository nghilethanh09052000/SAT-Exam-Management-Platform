/**
 * Extracts text from text-based PDFs and parses questions using the same
 * template markers as the DOCX importer.
 */

import { parseTextQuestions } from './docx-parser'
import { generateContentHash } from '@/lib/utils/hash'
import type { ParsedOption, ParsedQuestion, ParseResult, QuestionDifficulty } from '@/types'

const DEFAULT_MODULE = 'Bài thi'
export type QuestionImageMap = Map<string, string[]>

export interface ExtractedPdfDocument {
  text: string
  pageTexts: string[]
  questionImages: QuestionImageMap
  imagesInOrder: string[]
}

interface ExtractedPdfImages {
  questionImages: QuestionImageMap
  imagesInOrder: string[]
}

interface ExtractedPdfImage {
  dataUrl: string
  width: number
  height: number
}

const SAT_QUESTION_BANK_GRAPH_CROP = {
  x: 15,
  y: 175,
  width: 300,
  height: 245,
}

export async function parsePdf(buffer: ArrayBuffer): Promise<ParseResult> {
  try {
    const { text, questionImages } = await extractPdfDocument(buffer)

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

    const questionBankResult = parseSatSuiteQuestionBankText(text, questionImages)
    if (questionBankResult.success) return questionBankResult

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

export async function extractPdfDocument(buffer: ArrayBuffer): Promise<ExtractedPdfDocument> {
  // pdf-parse v1 bundles its own pdfjs copy (v2, pure Node.js, no worker
  // file, no DOMMatrix dependency) — safe to require() in serverless.
  //
  // Unlike v2, v1 joins pages with '\n\n' — there are no form-feed chars.
  // We use the `pagerender` callback to collect per-page texts ourselves
  // so that extractQuestionImages can map embedded images to the right page.
  const pageTexts: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const pdfParse = require('pdf-parse') as (buf: Buffer, opts?: any) => Promise<{ text: string }>
  const result = await pdfParse(Buffer.from(buffer), {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pagerender: async (pageData: any): Promise<string> => {
      const tc = await pageData.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      })
      let lastY: number | undefined
      let pageText = ''
      for (const item of tc.items as Array<{ str: string; transform: number[] }>) {
        if (lastY === item.transform[5] || lastY === undefined) {
          pageText += item.str
        } else {
          pageText += '\n' + item.str
        }
        lastY = item.transform[5]
      }
      pageTexts.push(pageText)
      return pageText
    },
  })

  const text = result.text.replace(/\n{3,}/g, '\n\n').trim()
  const { questionImages, imagesInOrder } = await extractQuestionImages(Buffer.from(buffer), pageTexts)

  return { text, pageTexts, questionImages, imagesInOrder }
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

export function parseSatSuiteQuestionBankText(
  text: string,
  questionImages: QuestionImageMap = new Map()
): ParseResult {
  if (!/^Question ID\s+[a-z0-9]+\s*$/im.test(text) || !/^Correct Answer:\s*$/im.test(text)) {
    return {
      success: false,
      questions: [],
      errors: [{ line: 0, message: 'PDF không phải định dạng SAT Suite Question Bank.' }],
    }
  }

  const blocks = text
    .split(/(?=^Question ID\s+[a-z0-9]+\s*$)/gim)
    .map((block) => block.trim())
    .filter(Boolean)

  const questions: ParsedQuestion[] = []
  const errors: ParseResult['errors'] = []

  blocks.forEach((block, idx) => {
    const parsed = parseSatSuiteQuestionBankBlock(block, idx + 1, questionImages)
    if (parsed.question) questions.push(parsed.question)
    errors.push(...parsed.errors)
  })

  if (questions.length === 0) {
    return {
      success: false,
      questions: [],
      errors: errors.length ? errors : [{ line: 0, message: 'Không tìm thấy câu hỏi SAT Question Bank hợp lệ.' }],
    }
  }

  return { success: errors.length === 0, questions: errors.length === 0 ? questions : [], errors }
}

function parseSatSuiteQuestionBankBlock(
  block: string,
  questionNumber: number,
  questionImages: QuestionImageMap
): { question: ParsedQuestion | null; errors: ParseResult['errors'] } {
  const errors: ParseResult['errors'] = []
  const id = /^Question ID\s+([a-z0-9]+)\s*$/im.exec(block)?.[1]
  if (!id) return { question: null, errors: [{ line: 0, message: `Câu hỏi ${questionNumber} thiếu Question ID.` }] }

  const beforeAnswer = block.split(new RegExp(`^ID:\\s*${escapeRegExp(id)}\\s+Answer\\s*$`, 'im'))[0] ?? ''
  const answer = matchQuestionBankField(block, /^Correct Answer:\s*$/im, /^Rationale\s*$/im)
  const rationale = matchQuestionBankField(block, /^Rationale\s*$/im, /^Question Difficulty:\s*$/im)
  const prompt = repairQuestionBankPrompt(
    cleanQuestionBankQuestionText(beforeAnswer, id),
    rationale,
    normalizeQuestionBankCorrectLabel(answer)
  )
  const difficulty = normalizeDifficulty(matchSingleLine(block, /^Question Difficulty:\s*(.+)$/im) ?? '')
    ?? normalizeDifficulty(matchQuestionBankMetadata(block, 'Difficulty') ?? '')
  const test = matchQuestionBankMetadata(block, 'Test')
  const module = test && /math/i.test(test) ? 'Module 1: Math' : 'Module 1: Reading and Writing'
  const category = matchQuestionBankMetadata(block, 'Skill') ?? matchQuestionBankMetadata(block, 'Domain')
  const imageDataUrls = questionImages.get(questionBankImageId(id)) ?? []
  const optionMatches = Array.from(prompt.matchAll(/^([A-D])\.\s*(.*)$/gim))

  if (!prompt) {
    return { question: null, errors: [{ line: 0, message: `Câu hỏi ${questionNumber} thiếu nội dung.` }] }
  }

  if (optionMatches.length >= 2) {
    const questionStem = cleanWhitespace(prompt.slice(0, optionMatches[0].index ?? 0))
    const correctLabel = normalizeQuestionBankCorrectLabel(answer)
    const options = optionMatches.map((match, optionIdx): ParsedOption => {
      const start = (match.index ?? 0) + match[0].length
      const end = optionMatches[optionIdx + 1]?.index ?? prompt.length
      return {
        label: match[1].toUpperCase(),
        content: cleanWhitespace([match[2], prompt.slice(start, end)].join('\n')),
        isCorrect: match[1].toUpperCase() === correctLabel,
      }
    })

    return {
      question: {
        type: 'multiple_choice',
        module,
        content: questionStem,
        questionStem,
        options,
        acceptedAnswers: [],
        imageBase64: imageDataUrls[0] ?? null,
        contentHash: generateContentHash(`${id}\n${questionStem}`, correctLabel ?? answer ?? ''),
        difficulty,
        teacherExplanation: cleanWhitespace(rationale ?? '') || null,
        category: category ? cleanWhitespace(category) : null,
      },
      errors,
    }
  }

  const acceptedAnswers = (answer ?? '')
    .split(/,\s*/)
    .map((value) => cleanWhitespace(value))
    .filter(Boolean)

  return {
    question: {
      type: 'short_answer',
      module,
      content: prompt,
      questionStem: prompt,
      options: [],
      acceptedAnswers,
      imageBase64: imageDataUrls[0] ?? null,
      contentHash: generateContentHash(`${id}\n${prompt}`, acceptedAnswers.join('|') || id),
      difficulty,
      teacherExplanation: cleanWhitespace(rationale ?? '') || null,
      category: category ? cleanWhitespace(category) : null,
    },
    errors,
  }
}

function cleanQuestionBankQuestionText(blockBeforeAnswer: string, id: string) {
  return blockBeforeAnswer
    .replace(/^Question ID\s+[a-z0-9]+\s*$/gim, '')
    .replace(new RegExp(`^ID:\\s*${escapeRegExp(id)}\\s*$`, 'gim'), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function repairQuestionBankPrompt(prompt: string, rationale: string | null, correctLabel: string | null) {
  if (!rationale || !hasQuestionBankExtractionGaps(prompt)) return prompt

  const point = extractPointFromRationale(rationale, 'point')
  const swappedPoint = extractSwappedPointFromRationale(rationale)
  const swappedChoice = extractSwappedChoiceFromRationale(rationale)
  const perimeter = extractPerimeterFromRationale(rationale)
  const variables = extractLengthWidthVariables(rationale)
  const lengthWidth = point ? { length: point[0], width: point[1] } : null
  const swappedLengthWidth = swappedPoint ? { length: swappedPoint[0], width: swappedPoint[1] } : null
  let repaired = prompt

  if (variables) {
    repaired = repaired
      .replace(/length\s*,\s*,\s*and width\s*,/i, `length ${variables.length}, and width ${variables.width},`)
      .replace(/length\s*,\s*in meters/i, `length ${variables.length}, in meters`)
      .replace(/width\s*,\s*in meters/i, `width ${variables.width}, in meters`)
  }

  if (perimeter !== null) {
    repaired = repaired.replace(/perimeter of\s*\./i, `perimeter of ${perimeter} meters.`)
  }

  if (point) {
    repaired = repaired.replace(/the point\s+in this context/i, `the point (${point[0]}, ${point[1]}) in this context`)
  }

  let lessThanOptionIndex = 0
  return repaired
    .split(/\n/)
    .map((line) => {
      const repairedLine = repairQuestionBankOptionLine(line, {
        correctLabel,
        lengthWidth,
        swappedChoice,
        swappedLengthWidth,
        lessThanOptionIndex,
      })
      if (/^[A-D]\.\s*The length is\s+less than the perimeter, and the width is\s+less than the perimeter\.$/i.test(line)) {
        lessThanOptionIndex++
      }
      return repairedLine
    })
    .join('\n')
}

function repairQuestionBankOptionLine(
  line: string,
  {
    correctLabel,
    lengthWidth,
    swappedChoice,
    swappedLengthWidth,
    lessThanOptionIndex,
  }: {
    correctLabel: string | null
    lengthWidth: { length: number; width: number } | null
    swappedChoice: string | null
    swappedLengthWidth: { length: number; width: number } | null
    lessThanOptionIndex: number
  }
) {
  const blankPoint = /^([A-D])\.\s*The length is\s*,\s*and the width is\s*\.$/i.exec(line)
  if (blankPoint) {
    const label = blankPoint[1].toUpperCase()
    if (label === correctLabel && lengthWidth) {
      return `${label}. The length is ${lengthWidth.length} m, and the width is ${lengthWidth.width} m.`
    }
    if (label === swappedChoice && swappedLengthWidth) {
      return `${label}. The length is ${swappedLengthWidth.length} m, and the width is ${swappedLengthWidth.width} m.`
    }
  }

  const lessThanLine = /^([A-D])\.\s*The length is\s+less than the perimeter, and the width is\s+less than the perimeter\.$/i.exec(line)
  if (lessThanLine) {
    const label = lessThanLine[1].toUpperCase()
    const values = lessThanOptionIndex === 0 && swappedLengthWidth ? swappedLengthWidth : lengthWidth
    if (values) {
      return `${label}. The length is ${values.length} m less than the perimeter, and the width is ${values.width} m less than the perimeter.`
    }
  }

  return line
}

function hasQuestionBankExtractionGaps(prompt: string) {
  return /,\s*,/.test(prompt)
    || /perimeter of\s*\./i.test(prompt)
    || /point\s+in this context/i.test(prompt)
    || /is\s*,\s*and/.test(prompt)
    || /is\s+less than/i.test(prompt)
}

function extractPointFromRationale(rationale: string, context: 'point') {
  const compact = rationale.replace(/\s+/g, ' ')
  const pattern = context === 'point'
    ? /point\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/i
    : /\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/
  const match = pattern.exec(compact)
  return match ? [Number(match[1]), Number(match[2])] as const : null
}

function extractSwappedPointFromRationale(rationale: string) {
  const compact = rationale.replace(/\s+/g, ' ')
  const match = /interpretation of the point\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/i.exec(compact)
  return match ? [Number(match[1]), Number(match[2])] as const : null
}

function extractSwappedChoiceFromRationale(rationale: string) {
  const compact = rationale.replace(/\s+/g, ' ')
  return /Choice\s+([A-D])\s+is incorrect\.\s+This is an interpretation of the point\s*\(/i.exec(compact)?.[1]?.toUpperCase() ?? null
}

function extractPerimeterFromRationale(rationale: string) {
  const compact = rationale.replace(/\s+/g, ' ')
  const match = /perimeter of\s*(-?\d+(?:\.\d+)?)\s*m/i.exec(compact)
  return match ? Number(match[1]) : null
}

function extractLengthWidthVariables(rationale: string) {
  const compact = rationale.replace(/\s+/g, ' ')
  const match = /length\s+([a-z푎-푧]),\s*in meters.*?width\s+([a-z푎-푧]),\s*in meters/i.exec(compact)
  return match ? { length: match[1], width: match[2] } : null
}

function matchQuestionBankField(block: string, startPattern: RegExp, endPattern: RegExp) {
  const start = startPattern.exec(block)
  if (!start) return null
  const startIndex = (start.index ?? 0) + start[0].length
  const rest = block.slice(startIndex)
  const end = endPattern.exec(rest)
  return (end ? rest.slice(0, end.index ?? 0) : rest).trim()
}

function matchQuestionBankMetadata(block: string, label: string) {
  const lines = block.split(/\n/).map((line) => line.trim())
  const idx = lines.findIndex((line) => line.toLowerCase() === label.toLowerCase())
  if (idx < 0) return null

  const values: string[] = []
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) break
    if (/^(Assessment|Test|Domain|Skill|Difficulty)$/i.test(line)) break
    values.push(line)
  }

  return values.join(' ').trim() || null
}

function normalizeQuestionBankCorrectLabel(answer: string | null) {
  const clean = cleanWhitespace(answer ?? '').toUpperCase()
  return /^[A-D]$/.test(clean) ? clean : null
}

function questionBankImageId(id: string) {
  return `question-bank:${id}`
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

  // SAT export PDFs (especially from pdfjs v2/pdf-parse v1) concatenate the
  // option label and its text with no separator: "AIt is the subject…",
  // "Butopian✓ Correct".  They can also use "A. text", "A) text", "A text",
  // or the letter alone on its own line (pdfjs v5 style).
  //
  // Strategy:
  //  1. Broad regex captures all four formats; groups:
  //       1 = label (A-D)
  //       2 = content after )/.  separator
  //       3 = content after space
  //       4 = content directly after label (no separator)
  //  2. We only search AFTER the question stem, identified by the last '?'
  //     in the block, to avoid matching A/B/C/D that appear in passage prose.
  //  3. We pick the first sequential A→B→C→D to be robust against any
  //     remaining false positives.

  const lastQuestionMarkPos = withoutMetadata.lastIndexOf('?')
  const optionSearchStart = lastQuestionMarkPos >= 0
    ? ((withoutMetadata.indexOf('\n', lastQuestionMarkPos) + 1) || (lastQuestionMarkPos + 1))
    : 0

  const optionCandidates = Array.from(withoutMetadata.matchAll(
    /^\s*([A-D])(?:[).]\s*(.*)?|\s+(.*)|(.+))?\s*$/gm
  ))

  const optionMatches: RegExpMatchArray[] = []
  for (const candidate of optionCandidates) {
    if ((candidate.index ?? 0) < optionSearchStart) continue
    const expected = String.fromCharCode('A'.charCodeAt(0) + optionMatches.length)
    if (candidate[1] === expected) {
      optionMatches.push(candidate)
      if (optionMatches.length === 4) break
    }
  }

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
    // group 2: content after )/. separator; group 3: after space; group 4: directly after label
    const inlineContent = (optionMatch[2] ?? optionMatch[3] ?? optionMatch[4] ?? '').trim()
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
  return normalizeMathGlyphs(value)
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function normalizeMathGlyphs(value: string) {
  return value.replace(/(?:\uD835[\uDC4E-\uDC67]|[\uD44E-\uD467]|\u210E)/g, (char) => {
    if (char === '\u210E') return 'h'
    const rawCode = char.codePointAt(0)
    const code = rawCode && rawCode >= 0xD44E && rawCode <= 0xD467
      ? rawCode + 0x10000
      : rawCode
    if (!code) return char
    const index = code - 0x1D44E
    if (index < 0 || index > 25) return char
    return String.fromCharCode('a'.charCodeAt(0) + index)
  })
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

/**
 * Extract embedded images from a PDF using pdf-lib (pure JS, no native
 * binaries required — works on Vercel serverless).
 *
 * Supports JPEG (DCTDecode) and PNG/deflate (FlateDecode) image XObjects.
 * Each image is returned as a base64 data URL and associated with a question
 * number via the page text that was collected during text extraction.
 */
async function extractQuestionImages(pdfBuffer: Buffer, pageTexts: string[]): Promise<ExtractedPdfImages> {
  const questionImages: QuestionImageMap = new Map()
  const imagesInOrder: string[] = []

  try {
    const { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFRef } = await import('pdf-lib')

    const pdfDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false })
    const imagesByPage = new Map<number, ExtractedPdfImage[]>()

    for (let pageIdx = 0; pageIdx < pdfDoc.getPageCount(); pageIdx++) {
      const page = pdfDoc.getPage(pageIdx)

      // Resources dict (may be a direct dict or an indirect reference)
      const rawResources = page.node.get(PDFName.of('Resources'))
      const resources = rawResources instanceof PDFRef
        ? pdfDoc.context.lookupMaybe(rawResources, PDFDict)
        : rawResources instanceof PDFDict ? rawResources : undefined
      if (!resources) continue

      // XObject dict inside Resources
      const rawXObjects = resources.get(PDFName.of('XObject'))
      const xObjects = rawXObjects instanceof PDFRef
        ? pdfDoc.context.lookupMaybe(rawXObjects, PDFDict)
        : rawXObjects instanceof PDFDict ? rawXObjects : undefined
      if (!xObjects) continue

      const pageImages: ExtractedPdfImage[] = []

      for (const [, ref] of xObjects.entries()) {
        // Resolve indirect reference → raw stream
        const resolved = ref instanceof PDFRef ? pdfDoc.context.lookup(ref) : ref
        const xObject  = resolved instanceof PDFRawStream ? resolved : undefined
        if (!xObject) continue

        const subtype = xObject.dict.get(PDFName.of('Subtype'))
        if (subtype?.toString() !== '/Image') continue

        // Resolve filter — can be a name or an array of names
        const filterObj = xObject.dict.get(PDFName.of('Filter'))
        const filterStr = filterObj?.toString() ?? ''

        let image: ExtractedPdfImage | null = null

        if (filterStr === '/DCTDecode') {
          // JPEG: the raw stream content is already a valid JPEG file
          const width  = Number(xObject.dict.get(PDFName.of('Width'))?.toString()  ?? 0)
          const height = Number(xObject.dict.get(PDFName.of('Height'))?.toString() ?? 0)
          image = {
            dataUrl: `data:image/jpeg;base64,${Buffer.from(xObject.contents).toString('base64')}`,
            width,
            height,
          }
        } else if (filterStr === '/FlateDecode') {
          // Deflate-compressed bitmap.  Decompress and re-encode as PNG.
          // We only attempt this when the colour space is RGB or Gray
          // (other spaces such as CMYK require colour conversion).
          try {
            const { inflateSync } = await import('zlib')
            const width  = Number(xObject.dict.get(PDFName.of('Width'))?.toString()  ?? 0)
            const height = Number(xObject.dict.get(PDFName.of('Height'))?.toString() ?? 0)
            const bpc    = Number(xObject.dict.get(PDFName.of('BitsPerComponent'))?.toString() ?? 8)
            const csObj  = xObject.dict.get(PDFName.of('ColorSpace'))
            const cs     = csObj?.toString() ?? ''

            // ICCBased is treated as RGB (3 channels) — ICC is just a colour
            // correction profile on top of an RGB/Gray space.
            const channels3 = /DeviceRGB|ICCBased/.test(cs) ? 3 : /DeviceGray/.test(cs) ? 1 : null
            if (width > 0 && height > 0 && bpc === 8 && channels3 !== null) {
              const channels = channels3 as 1 | 3
              const raw = inflateSync(Buffer.from(xObject.contents))
              // Build a minimal PNG from raw pixel data using pure Node.js
              image = {
                dataUrl: rawPixelsToPngDataUrl(raw, width, height, channels),
                width,
                height,
              }
            }
          } catch {
            // Decompression failed — skip this image silently
          }
        }

        if (image && isStandaloneQuestionImage(image)) pageImages.push(image)
      }

      if (pageImages.length > 0) {
        imagesInOrder.push(...pageImages.map((image) => image.dataUrl))
        imagesByPage.set(pageIdx + 1, pageImages) // 1-indexed to match pdfimages convention
      }
    }

    // Map page images → question numbers using the per-page text
    let currentModule = DEFAULT_MODULE
    let currentQuestionBankId: string | null = null
    for (let pageNum = 1; pageNum <= pageTexts.length; pageNum++) {
      const pageText = pageTexts[pageNum - 1] ?? ''
      const module = findNearestModule(pageText)
      if (module) currentModule = module

      const questionBankId = /^Question ID\s+([a-z0-9]+)\s*$/im.exec(pageText)?.[1]
      if (questionBankId) currentQuestionBankId = questionBankId

      const pageImages = imagesByPage.get(pageNum)

      if (currentQuestionBankId) {
        if (!pageImages?.length && isLikelyVectorQuestionBankGraphic(pageText)) {
          const vectorImage = await renderPdfPageCropSvgDataUrl(pdfBuffer, pageNum, SAT_QUESTION_BANK_GRAPH_CROP)
          if (vectorImage) {
            questionImages.set(
              questionBankImageId(currentQuestionBankId),
              [...(questionImages.get(questionBankImageId(currentQuestionBankId)) ?? []), vectorImage]
            )
          }
          continue
        }

        if (!pageImages?.length) continue
        const key = questionBankImageId(currentQuestionBankId)
        questionImages.set(key, [...(questionImages.get(key) ?? []), ...pageImages.map((image) => image.dataUrl)])
        continue
      }

      if (!pageImages?.length) continue

      // Primary: SAT export format "Question N"
      const questionMatches = Array.from(pageText.matchAll(/^Question\s+(\d+)\s*$/gim))

      if (questionMatches.length === 0) {
        // Fallback: bluebooky format — bare question number as first non-empty line
        const firstNonEmpty = pageText.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? ''
        if (/^\d{1,3}$/.test(firstNonEmpty)) {
          const key = answerKeyId(DEFAULT_MODULE, Number(firstNonEmpty))
          questionImages.set(key, [...(questionImages.get(key) ?? []), ...pageImages.map((image) => image.dataUrl)])
        }
        continue
      }

      if (questionMatches.length !== 1) continue

      const key = answerKeyId(currentModule, Number(questionMatches[0][1]))
      questionImages.set(key, [...(questionImages.get(key) ?? []), ...pageImages.map((image) => image.dataUrl)])
    }
  } catch (err) {
    // Best-effort: image extraction failure must never break the text import
    console.error('[pdf-parser] image extraction failed:', err instanceof Error ? err.message : err)
  }

  return { questionImages, imagesInOrder }
}

function isLikelyVectorQuestionBankGraphic(pageText: string) {
  return /\b(?:graph|figure|diagram)\b/i.test(pageText)
}

async function renderPdfPageCropSvgDataUrl(
  pdfBuffer: Buffer,
  pageNumber: number,
  crop: { x: number; y: number; width: number; height: number }
) {
  try {
    const [{ DOMImplementation, XMLSerializer }] = await Promise.all([
      import('@xmldom/xmldom'),
    ])
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const pdfjs = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js') as any
    const previousDocument = (globalThis as { document?: unknown }).document
    const previousLog = console.log
    const previousWarn = console.warn
    const suppressPdfJsNoise = (...args: unknown[]) => {
      const message = String(args[0] ?? '')
      if (/^(Warning: )?(Load test font never loaded|Unimplemented graphic state|Unimplemented operator dependency)/.test(message)) return
      previousWarn(...args)
    }

    const implementation = new DOMImplementation()
    const documentNode = implementation.createDocument('http://www.w3.org/1999/xhtml', 'html', null) as unknown as {
      createElement: (name: string) => any
      documentElement: { appendChild: (node: unknown) => unknown }
      head?: unknown
      body?: unknown
    }
    const createElement = documentNode.createElement.bind(documentNode)
    documentNode.createElement = (name: string) => {
      const element = createElement(name)
      element.style = {}
      const lower = name.toLowerCase()
      if (lower === 'style') {
        element.sheet = {
          cssRules: [],
          insertRule(rule: string) {
            this.cssRules.push(rule)
          },
        }
      }
      if (lower === 'canvas') {
        element.getContext = () => ({
          fillRect() {},
          fillText() {},
          measureText() { return { width: 0 } },
          getImageData() { return { data: new Uint8ClampedArray(4) } },
        })
      }
      return element
    }

    const head = documentNode.createElement('head')
    const body = documentNode.createElement('body')
    documentNode.head = head
    documentNode.body = body
    documentNode.documentElement.appendChild(head)
    documentNode.documentElement.appendChild(body)

    try {
      ;(globalThis as { document?: unknown }).document = documentNode
      console.log = suppressPdfJsNoise
      console.warn = suppressPdfJsNoise

      const pdf = await pdfjs.getDocument({ data: pdfBuffer, disableFontFace: true }).promise
      const page = await pdf.getPage(pageNumber)
      const opList = await page.getOperatorList()
      const viewport = page.getViewport(1)
      const svgGfx = new pdfjs.SVGGraphics(page.commonObjs, page.objs, true)
      svgGfx.embedFonts = false
      const svg = await svgGfx.getSVG(opList, viewport)
      const xml = new XMLSerializer().serializeToString(svg)
      const cropped = cropSvg(xml, crop)
      return `data:image/svg+xml;base64,${Buffer.from(cropped, 'utf8').toString('base64')}`
    } finally {
      console.log = previousLog
      console.warn = previousWarn
      ;(globalThis as { document?: unknown }).document = previousDocument
    }
  } catch (err) {
    console.error('[pdf-parser] vector graphic extraction failed:', err instanceof Error ? err.message : err)
    return null
  }
}

function cropSvg(svg: string, crop: { x: number; y: number; width: number; height: number }) {
  return svg
    .replace(/^<svg:svg\b/, '<svg:svg')
    .replace(/\swidth="[^"]+"/, ` width="${crop.width}px"`)
    .replace(/\sheight="[^"]+"/, ` height="${crop.height}px"`)
    .replace(/\spreserveAspectRatio="[^"]+"/, ' preserveAspectRatio="xMinYMin meet"')
    .replace(/\sviewBox="[^"]+"/, ` viewBox="${crop.x} ${crop.y} ${crop.width} ${crop.height}"`)
}

function isStandaloneQuestionImage(image: ExtractedPdfImage) {
  if (image.width <= 0 || image.height <= 0) return false

  // SAT Question Bank PDFs often store inline equations as tiny image
  // snippets. They should stay in text/math handling, not become huge
  // question-level images in the review UI.
  if (image.height < 60) return false
  if (image.width < 90) return false

  return true
}

/**
 * Encode raw pixel bytes (RGB or Grayscale, 8-bit, no alpha) as a PNG data URL
 * using only Node.js built-ins (no sharp / canvas required).
 */
function rawPixelsToPngDataUrl(raw: Buffer, width: number, height: number, channels: 1 | 3): string {
  const { createHash } = require('crypto') as typeof import('crypto')
  const { deflateSync } = require('zlib')   as typeof import('zlib')

  const colorType = channels === 1 ? 0 : 2  // 0=grayscale, 2=RGB
  const stride    = width * channels

  // Filter byte (0 = None) prepended to each row
  const filtered = Buffer.allocUnsafe(height * (1 + stride))
  for (let y = 0; y < height; y++) {
    filtered[y * (1 + stride)] = 0
    raw.copy(filtered, y * (1 + stride) + 1, y * stride, (y + 1) * stride)
  }

  const idat = deflateSync(filtered)

  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.allocUnsafe(4)
    len.writeUInt32BE(data.length, 0)
    const typeB = Buffer.from(type, 'ascii')
    const crcInput = Buffer.concat([typeB, data])
    const crc = Buffer.allocUnsafe(4)
    // CRC-32 via a quick-and-dirty implementation
    let c = 0xffffffff
    for (let i = 0; i < crcInput.length; i++) {
      c ^= crcInput[i]
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0)
    return Buffer.concat([len, typeB, data, crc])
  }

  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(width,  0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8]  = 8          // bit depth
  ihdr[9]  = colorType
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])

  return `data:image/png;base64,${png.toString('base64')}`
}
