import {
  isMappedFormat,
  parseMappedFormat,
  extractMappedFormatText,
  type RawParagraph,
} from '@/lib/parsers/docx-parser'

function p(text: string, isBold = false): RawParagraph {
  return { text, isBold, imageBase64: null, lineNumber: 0 }
}

const SIMPLE_TWO_QUESTIONS: RawParagraph[] = [
  p('00000_Question_1(Phase2Test5)_Word In Context_SC', true),
  p('00001_'),
  p('00002_ The 2019 report. This trend ______ the traditional reliance on fossil fuels.'),
  p('00006_'),
  p('- sustains'),
  p('- challenges T (True)'),
  p('- confirms'),
  p('- ignores'),
  p('==End=='),
  p('00000_Question_2(Phase2Test5)_Word In Context_SC', true),
  p('00001_Some scientists believe bears can hibernate due to shared genes.'),
  p('00002_Which choice completes the text with the most logical and precise word or phrase?'),
  p('00006_'),
  p('- crucial'),
  p('- absent'),
  p('- fluctuating'),
  p('- inactiveT (True)'),
  p('==End=='),
]

describe('isMappedFormat', () => {
  it('detects mapped format', () => {
    expect(isMappedFormat(SIMPLE_TWO_QUESTIONS)).toBe(true)
  })

  it('rejects legacy template format', () => {
    const legacy: RawParagraph[] = [
      p('Module 1: Reading and Writing', true),
      p('Question 1', true),
    ]
    expect(isMappedFormat(legacy)).toBe(false)
  })

  it('returns false for empty input', () => {
    expect(isMappedFormat([])).toBe(false)
  })
})

describe('parseMappedFormat', () => {
  it('parses two questions successfully', () => {
    const result = parseMappedFormat(SIMPLE_TWO_QUESTIONS)
    expect(result.success).toBe(true)
    expect(result.questions).toHaveLength(2)
    expect(result.errors).toHaveLength(0)
  })

  it('Q1: no passage, question stem from 00002_', () => {
    const q = parseMappedFormat(SIMPLE_TWO_QUESTIONS).questions[0]
    expect(q.questionStem).toMatch(/The 2019 report/)
    expect(q.content).toMatch(/fossil fuels/)
    expect(q.category).toBe('Word In Context')
  })

  it('Q1: correct answer detected via T (True)', () => {
    const q = parseMappedFormat(SIMPLE_TWO_QUESTIONS).questions[0]
    expect(q.options).toHaveLength(4)
    const correct = q.options.find((o) => o.isCorrect)
    expect(correct?.content).toBe('challenges')
    expect(correct?.label).toBe('B')
    expect(q.options.filter((o) => o.isCorrect)).toHaveLength(1)
  })

  it('Q2: passage in 00001_, stem in 00002_', () => {
    const q = parseMappedFormat(SIMPLE_TWO_QUESTIONS).questions[1]
    expect(q.content).toMatch(/bears can hibernate/)
    expect(q.content).toMatch(/most logical/)
  })

  it('Q2: correct answer without space before T (True)', () => {
    const q = parseMappedFormat(SIMPLE_TWO_QUESTIONS).questions[1]
    const correct = q.options.find((o) => o.isCorrect)
    expect(correct?.content).toBe('inactive')
    expect(correct?.label).toBe('D')
  })

  it('multi-paragraph passage is joined', () => {
    const paras: RawParagraph[] = [
      p('00000_Question_8(Phase2Test5)_Cross Text_SC', true),
      p('00001_Text 1'),
      p("George Orwell's Homage to Catalonia diverges from his famed allegories."),
      p('Text 2'),
      p('Homage to Catalonia reflects his enduring concerns with truth.'),
      p('00002_How would the author of Text 2 respond to Text 1?'),
      p('00006_'),
      p('- By suggesting it is too narrow.'),
      p('- By conceding narrower appeal.'),
      p('- By indicating marginal interest.'),
      p('- By recognizing divergence but insisting on significance. T (True)'),
      p('==End=='),
    ]
    const result = parseMappedFormat(paras)
    expect(result.success).toBe(true)
    const q = result.questions[0]
    expect(q.content).toMatch(/Text 1/)
    expect(q.content).toMatch(/Text 2/)
    expect(q.content).toMatch(/Homage to Catalonia/)
    const correct = q.options.find((o) => o.isCorrect)
    expect(correct?.content).toBe('By recognizing divergence but insisting on significance.')
  })

  it('00006_ line with trailing junk text is handled', () => {
    const paras: RawParagraph[] = [
      p('00000_Question_6(Phase2Test5)_Text Structure_SC', true),
      p('00001_Nuclear fusion holds promise as a clean source of energy.'),
      p('00002_Which choice best describes the function of the second sentence?'),
      p('00006_Botanist Rebecca Patterson (this is junk text on the 00006_ line)'),
      p('- It describes the underlying principle.'),
      p('- It highlights the main achievement.'),
      p("- It outlines the technical challenge Martinez's research aims to address.T (True)"),
      p('- It provides a summary of nuclear fusion research.'),
      p('==End=='),
    ]
    const result = parseMappedFormat(paras)
    expect(result.success).toBe(true)
    const correct = result.questions[0].options.find((o) => o.isCorrect)
    expect(correct?.content).toMatch(/technical challenge/)
  })

  it('missing T (True) marker — question is included but no correct answer', () => {
    const paras: RawParagraph[] = [
      p('00000_Question_11_Command of Evidence_SC', true),
      p('00001_Some passage text about cognitive dissonance.'),
      p('00002_Which finding would most challenge the theory?'),
      p('00006_'),
      p('- Option A without any correct marker.'),
      p('- Option B without any correct marker.'),
      p('- Option C without any correct marker.'),
      p('- Option D without any correct marker.'),
      p('==End=='),
    ]
    const result = parseMappedFormat(paras)
    expect(result.success).toBe(true)
    const q = result.questions[0]
    expect(q.options.every((o) => !o.isCorrect)).toBe(true)
  })

  it('wrong option count errors', () => {
    const paras: RawParagraph[] = [
      p('00000_Question_1_Word In Context_SC', true),
      p('00001_'),
      p('00002_Question with only 3 options.'),
      p('00006_'),
      p('- Option A'),
      p('- Option B T (True)'),
      p('- Option C'),
      p('==End=='),
    ]
    const result = parseMappedFormat(paras)
    expect(result.success).toBe(false)
    expect(result.errors[0].message).toMatch(/3.*đáp án/)
  })
})

describe('extractMappedFormatText', () => {
  it('strips - prefix from list items, preserves markers', () => {
    const text = extractMappedFormatText(SIMPLE_TWO_QUESTIONS)
    const lines = text.split('\n')
    expect(lines).toContain('00000_Question_1(Phase2Test5)_Word In Context_SC')
    expect(lines).toContain('00001_')
    expect(lines).toContain('sustains')           // '- sustains' stripped
    expect(lines).toContain('challenges T (True)') // '- challenges T (True)' stripped
    expect(lines).toContain('==End==')
  })
})
