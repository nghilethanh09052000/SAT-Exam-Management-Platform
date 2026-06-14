import mammoth from 'mammoth'
import { z } from 'zod'
import { createDeepSeekClient } from '@/lib/ai/deepseek-client'
import { generateContentHash } from '@/lib/utils/hash'
import { extractPdfDocument, parseSatSuiteQuestionBankText, type QuestionImageMap } from './pdf-parser'
import type { ParsedOption, ParsedQuestion, ParseResult } from '@/types'

type ImportFileType = 'docx' | 'pdf'

const DEFAULT_MODULE = 'Bài thi'
const MAX_DEEPSEEK_TEXT_CHARS = 120_000

const DeepSeekOptionSchema = z.object({
  label: z.enum(['A', 'B', 'C', 'D']),
  content: z.string().default(''),
  isCorrect: z.boolean().optional(),
})

const DeepSeekQuestionSchema = z.object({
  questionNumber: z.number().int().positive().optional(),
  module: z.string().nullable().optional(),
  subject: z.enum(['math', 'reading_writing']).nullable().optional(),
  type: z.enum(['multiple_choice', 'short_answer']),
  stimulus: z.string().nullable().optional(),
  prompt: z.string().default(''),
  options: z.array(DeepSeekOptionSchema).optional(),
  acceptedAnswers: z.array(z.string()).optional(),
  correctAnswer: z.string().nullable().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).nullable().optional(),
  category: z.string().nullable().optional(),
  teacherExplanation: z.string().nullable().optional(),
})

const DeepSeekResponseSchema = z.object({
  questions: z.array(DeepSeekQuestionSchema),
})

type DeepSeekQuestion = z.infer<typeof DeepSeekQuestionSchema>

interface ExtractedDocument {
  text: string
  questionImages: QuestionImageMap
  imagesInOrder: string[]
}

export async function parseWithDeepSeek({
  buffer,
  fileType,
}: {
  buffer: ArrayBuffer
  fileType: ImportFileType
}): Promise<ParseResult> {
  try {
    const extracted = fileType === 'pdf'
      ? await extractPdfForDeepSeek(buffer)
      : await extractDocxForDeepSeek(buffer)

    if (!extracted.text.trim()) {
      return {
        success: false,
        questions: [],
        errors: [{ line: 0, message: 'File không có text để gửi qua DeepSeek parser.' }],
      }
    }

    if (fileType === 'pdf') {
      const questionBankResult = parseSatSuiteQuestionBankText(extracted.text, extracted.questionImages)
      if (questionBankResult.success) return questionBankResult
    }

    const deepSeekQuestions = await askDeepSeekToParse({
      text: extracted.text,
      fileType,
    })

    const questions = convertDeepSeekQuestions(deepSeekQuestions, extracted)
    const validationError = validateParsedQuestions(questions)
    if (validationError) {
      return {
        success: false,
        questions: [],
        errors: [{ line: 0, message: validationError }],
      }
    }

    return { success: true, questions, errors: [] }
  } catch (err) {
    return {
      success: false,
      questions: [],
      errors: [
        {
          line: 0,
          message: `DeepSeek parser không thể phân tích file: ${err instanceof Error ? err.message : 'Lỗi không xác định'}`,
        },
      ],
    }
  }
}

async function extractPdfForDeepSeek(buffer: ArrayBuffer): Promise<ExtractedDocument> {
  const pdf = await extractPdfDocument(buffer)
  return {
    text: pdf.text,
    questionImages: pdf.questionImages,
    imagesInOrder: pdf.imagesInOrder,
  }
}

async function extractDocxForDeepSeek(buffer: ArrayBuffer): Promise<ExtractedDocument> {
  const nodeBuffer = Buffer.from(buffer)
  const [rawText, html] = await Promise.all([
    mammoth.extractRawText({ buffer: nodeBuffer }),
    mammoth.convertToHtml(
      { buffer: nodeBuffer },
      {
        convertImage: mammoth.images.imgElement((image) =>
          image.read('base64').then((imageBuffer) => ({
            src: `data:${image.contentType};base64,${imageBuffer}`,
          }))
        ),
      }
    ),
  ])

  const imagesInOrder = Array.from(html.value.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi))
    .map((match) => match[1])
    .filter(Boolean)

  return {
    text: cleanText(rawText.value),
    questionImages: new Map(),
    imagesInOrder,
  }
}

async function askDeepSeekToParse({
  text,
  fileType,
}: {
  text: string
  fileType: ImportFileType
}): Promise<DeepSeekQuestion[]> {
  const client = createDeepSeekClient()
  const clippedText = text.slice(0, MAX_DEEPSEEK_TEXT_CHARS)

  const response = await client.chat.completions.create({
    model: process.env.DEEPSEEK_IMPORT_MODEL || 'deepseek-chat',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          'You convert SAT question documents into strict JSON.',
          'Return JSON only.',
          'Do not invent missing answers, explanations, categories, or difficulty.',
          'Preserve the original question wording and answer option wording.',
          'If a correct answer is absent, set correctAnswer to null and leave isCorrect false or omitted.',
          'Use multiple_choice when answer choices are present.',
          'Use short_answer when there are no choices and an answer field exists.',
          'If passages, tables, or shared context appear before a question, put them in stimulus.',
          'Put the direct question stem in prompt.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `File type: ${fileType}`,
          'Return this JSON shape:',
          '{"questions":[{"questionNumber":1,"module":"Module 1: Reading and Writing","subject":"reading_writing","type":"multiple_choice","stimulus":null,"prompt":"...","options":[{"label":"A","content":"...","isCorrect":false}],"acceptedAnswers":[],"correctAnswer":"A","difficulty":null,"category":null,"teacherExplanation":null}]}',
          'For short_answer, use options: [] and acceptedAnswers when the answer is explicitly present.',
          'Document text:',
          clippedText,
        ].join('\n\n'),
      },
    ],
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('DeepSeek không trả về nội dung.')

  const json = parseDeepSeekJson(content)

  const parsed = DeepSeekResponseSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error('DeepSeek JSON không đúng cấu trúc import.')
  }

  return parsed.data.questions
}

function parseDeepSeekJson(content: string): unknown {
  const candidates = [
    content,
    content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
    extractJsonObject(content),
  ].filter((candidate): candidate is string => Boolean(candidate?.trim()))

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // Try the next cleanup strategy.
    }
  }

  throw new Error('DeepSeek không trả về JSON hợp lệ.')
}

function extractJsonObject(content: string) {
  const firstObject = content.indexOf('{')
  const lastObject = content.lastIndexOf('}')
  if (firstObject >= 0 && lastObject > firstObject) {
    return content.slice(firstObject, lastObject + 1)
  }

  const firstArray = content.indexOf('[')
  const lastArray = content.lastIndexOf(']')
  if (firstArray >= 0 && lastArray > firstArray) {
    return `{"questions":${content.slice(firstArray, lastArray + 1)}}`
  }

  return null
}

function convertDeepSeekQuestions(
  questions: DeepSeekQuestion[],
  extracted: ExtractedDocument
): ParsedQuestion[] {
  const usedOrderedImages = new Set<number>()

  return questions.map((question, index): ParsedQuestion => {
    const module = normalizeModule(question.module)
    const stimulus = cleanText(question.stimulus ?? '')
    const prompt = cleanText(question.prompt)
    const rawContent = [stimulus, prompt].filter(Boolean).join('\n\n').trim()
    const imageBase64 = pickImageForQuestion(question, module, index, extracted, usedOrderedImages)

    if (question.type === 'short_answer') {
      const acceptedAnswers = normalizeAcceptedAnswers(question)
      return {
        type: 'short_answer',
        module,
        stimulus: stimulus || null,
        prompt: prompt || null,
        content: rawContent,
        questionStem: prompt || rawContent,
        options: [],
        acceptedAnswers,
        imageBase64,
        contentHash: generateContentHash(rawContent, acceptedAnswers.join('|') || `missing-answer-${index + 1}`),
        difficulty: question.difficulty ?? null,
        teacherExplanation: cleanNullable(question.teacherExplanation),
        category: cleanNullable(question.category),
      }
    }

    const options = normalizeOptions(question)
    const correctKey = options.find((option) => option.isCorrect)?.label
      ?? normalizeCorrectAnswer(question.correctAnswer)
      ?? `missing-correct-answer-${index + 1}`

    return {
      type: 'multiple_choice',
      module,
      stimulus: stimulus || null,
      prompt: prompt || null,
      content: rawContent,
      questionStem: prompt || rawContent,
      options,
      acceptedAnswers: [],
      imageBase64,
      contentHash: generateContentHash(rawContent, correctKey),
      difficulty: question.difficulty ?? null,
      teacherExplanation: cleanNullable(question.teacherExplanation),
      category: cleanNullable(question.category),
    }
  })
}

function normalizeOptions(question: DeepSeekQuestion): ParsedOption[] {
  const correctLabel = normalizeCorrectAnswer(question.correctAnswer)
  const seen = new Set<string>()

  return (question.options ?? [])
    .filter((option) => {
      if (seen.has(option.label)) return false
      seen.add(option.label)
      return true
    })
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((option) => ({
      label: option.label,
      content: cleanText(option.content),
      isCorrect: Boolean(option.isCorrect) || option.label === correctLabel,
    }))
}

function normalizeAcceptedAnswers(question: DeepSeekQuestion): string[] {
  const answers = [
    ...(question.acceptedAnswers ?? []),
    question.correctAnswer ?? '',
  ]
    .map(cleanText)
    .filter(Boolean)

  return Array.from(new Set(answers))
}

function pickImageForQuestion(
  question: DeepSeekQuestion,
  module: string,
  index: number,
  extracted: ExtractedDocument,
  usedOrderedImages: Set<number>
) {
  if (question.questionNumber) {
    const direct = extracted.questionImages.get(`${module}::${question.questionNumber}`)
      ?? extracted.questionImages.get(`${DEFAULT_MODULE}::${question.questionNumber}`)
    if (direct?.[0]) return direct[0]
  }

  const orderedIndex = index
  if (!usedOrderedImages.has(orderedIndex) && extracted.imagesInOrder[orderedIndex]) {
    usedOrderedImages.add(orderedIndex)
    return extracted.imagesInOrder[orderedIndex]
  }

  return null
}

function validateParsedQuestions(questions: ParsedQuestion[]) {
  if (questions.length === 0) return 'DeepSeek không tìm thấy câu hỏi nào trong file.'

  for (let idx = 0; idx < questions.length; idx++) {
    const question = questions[idx]
    const humanIndex = idx + 1
    if (!question.content.trim()) return `Câu hỏi ${humanIndex} thiếu nội dung.`

    if (question.type === 'multiple_choice') {
      if (question.options.length < 2) return `Câu hỏi ${humanIndex} thiếu đáp án trắc nghiệm.`
      const labels = question.options.map((option) => option.label).join('')
      if (!/^[A-D]+$/.test(labels)) return `Câu hỏi ${humanIndex} có nhãn đáp án không hợp lệ.`
      if (question.options.some((option) => !option.content.trim())) {
        return `Câu hỏi ${humanIndex} có đáp án trống.`
      }
    }
  }

  return null
}

function normalizeModule(value?: string | null) {
  const clean = cleanText(value ?? '')
  if (!clean) return DEFAULT_MODULE

  const satExport = /^(Reading\s*&\s*Writing|Reading\s+and\s+Writing|Math)\s*-\s*Module\s*(\d+)$/i.exec(clean)
  if (satExport) {
    const subject = /^math$/i.test(satExport[1]) ? 'Math' : 'Reading and Writing'
    return `Module ${satExport[2]}: ${subject}`
  }

  const module = /^Module\s*(\d+)\s*:\s*(Reading\s+and\s+Writing|Math)$/i.exec(clean)
  if (module) {
    const subject = /^math$/i.test(module[2]) ? 'Math' : 'Reading and Writing'
    return `Module ${module[1]}: ${subject}`
  }

  return clean
}

function normalizeCorrectAnswer(value?: string | null) {
  const clean = cleanText(value ?? '').toUpperCase()
  const match = /^[A-D]$/.exec(clean) ?? /^OPTION\s+([A-D])$/.exec(clean) ?? /^([A-D])[\).]/.exec(clean)
  return match?.[1] ?? null
}

function cleanNullable(value?: string | null) {
  const clean = cleanText(value ?? '')
  return clean || null
}

function cleanText(value: string) {
  return value
    .replace(/\uFEFF/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
