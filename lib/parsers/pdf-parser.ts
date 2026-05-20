/**
 * Extracts text from text-based PDFs and parses questions using the same
 * template markers as the DOCX importer.
 */

import { parseTextQuestions } from './docx-parser'
import type { ParseResult } from '@/types'

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

    return parseTextQuestions(text)
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
