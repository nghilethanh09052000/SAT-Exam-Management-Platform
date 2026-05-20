/**
 * Extracts text from text-based PDFs and parses questions using the same
 * template markers as the DOCX importer.
 */

import { parseTextQuestions } from './docx-parser'
import { generateContentHash } from '@/lib/utils/hash'
import type { ParsedOption, ParsedQuestion, ParseResult, QuestionDifficulty } from '@/types'

const DEFAULT_MODULE = 'Bài thi'

export async function parsePdf(buffer: ArrayBuffer): Promise<ParseResult> {
  try {
    const { PDFParse } = await Function('return import("pdf-parse")')() as typeof import('pdf-parse')
    const parser = new PDFParse({ data: Buffer.from(buffer) })
    const result = await parser.getText()
    await parser.destroy()
    const text = result.text.trim()

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

    const templateResult = parseTextQuestions(text)
    if (templateResult.success) return templateResult

    const satExportResult = parseSatExportText(text)
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

export function parseSatExportText(text: string): ParseResult {
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
  line,
}: {
  block: string
  questionNumber: number
  module: string
  answerKey: Map<number, string>
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
  const content = cleanQuestionContent(withoutMetadata.slice(0, firstOptionIndex))
  if (!content) {
    errors.push({ line, message: `Câu hỏi ${questionNumber} thiếu nội dung câu hỏi.` })
    return { question: null, errors }
  }

  const keyAnswer = answerKey.get(questionNumber)
  const options: ParsedOption[] = optionMatches.slice(0, 4).map((optionMatch, optionIdx) => {
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
      isCorrect: keyAnswer ? label === keyAnswer : /✓\s*Correct/i.test(rawContent),
    }
  })

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
      imageBase64: null,
      contentHash: generateContentHash(content, correctOptions[0].content),
      difficulty,
      teacherExplanation,
      category,
    },
    errors,
  }
}

function extractAnswerKey(text: string): Map<number, string> {
  const answerKey = new Map<number, string>()
  const answerKeyText = text.split(/\n\s*Answer Key\s*\n/i)[1] ?? ''
  const matches = Array.from(answerKeyText.matchAll(/\bQ\s*(\d+)\s*[\r\n ]+([A-D])\b/gi))
  for (const match of matches) {
    answerKey.set(Number(match[1]), match[2].toUpperCase())
  }
  return answerKey
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
