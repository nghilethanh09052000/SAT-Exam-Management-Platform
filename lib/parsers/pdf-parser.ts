/**
 * Extracts text from text-based PDFs and parses questions using the same
 * template markers as the DOCX importer.
 */

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
    const { PDFParse } = await Function('return import("pdf-parse")')() as typeof import('pdf-parse')
    const parser = new PDFParse({ data: Buffer.from(buffer) })
    const result = await parser.getText()
    await parser.destroy()
    const text = result.text.trim()
    const pageTexts = result.pages?.map((page) => page.text ?? '') ?? []

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

    if (isSatExportText(text)) {
      const questionImages = await extractQuestionImages(Buffer.from(buffer), pageTexts)
      return parseSatExportText(text, questionImages)
    }

    const templateResult = parseTextQuestions(text)
    if (templateResult.success) return templateResult

    const questionImages = await extractQuestionImages(Buffer.from(buffer), pageTexts)
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
      const imagePath = join(workDir, `image-${String(idx).padStart(3, '0')}.png`)
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

      const questionMatches = Array.from(pageText.matchAll(/^Question\s+(\d+)\s*$/gim))
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
