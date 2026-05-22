/**
 * lib/categorization/classifier.ts
 * Rule-based SAT question category classifier — keyword scoring, no AI, no external API.
 *
 * Mirrors utils/classifier.py from the Python pipeline but uses simple
 * keyword hit-counting instead of TF-IDF (no ML library needed in Next.js).
 *
 * Usage:
 *   import { classifyQuestion } from '@/lib/categorization/classifier'
 *   const { category, confidence } = classifyQuestion(text, 'reading_writing')
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Subject = 'reading_writing' | 'math'
export type Confidence = 'high' | 'medium' | 'low'

export interface ClassifyResult {
  /** Canonical category name, e.g. "Words in Context" or "Algebra" */
  category: string
  /** high ≥ 3 keyword hits · medium 1–2 hits · low 0 hits */
  confidence: Confidence
  /** Raw keyword hit count — use to compare across subjects in backfill */
  score: number
}

// ─── RW keyword signals ───────────────────────────────────────────────────────

const RW_SIGNALS: Record<string, string[]> = {
  'Words in Context': [
    'most logical and precise',
    'most nearly mean',
    'as used in the text',
    'word or phrase',
    'which choice completes',
    'most logical word',
    'precise word',
    'choose the word',
    'fill in the blank',
    'best completes the text',
  ],
  'Central Ideas and Details': [
    'main idea',
    'mainly about',
    'primarily about',
    'best summarizes',
    'main point',
    'main claim',
    'central claim',
    'central purpose',
    'what does the text',
    'what does the passage',
    'main purpose of the text',
    'primarily discuss',
  ],
  'Command of Evidence – Textual': [
    'best supports',
    'most directly supports',
    'which quotation',
    'provides evidence',
    'undermine',
    'weaken',
    'illustrates the claim',
    'which finding',
    'if true would',
    'which detail',
    'which statement',
    'support the argument',
  ],
  'Command of Evidence – Quantitative': [
    'data in the table',
    'data in the figure',
    'according to the graph',
    'according to the figure',
    'according to the table',
    'based on the data',
    'graph shows',
    'table shows',
    'chart shows',
    'effectively uses data',
    'statistics show',
  ],
  'Inferences': [
    'most likely inferred',
    'can be inferred',
    'would most likely',
    'can be concluded',
    'logically follows',
    'reader can infer',
    'suggests that',
    'most strongly implies',
    'implies that',
    'conclusion can be drawn',
  ],
  'Text Structure and Purpose': [
    'main purpose',
    'primarily serves to',
    'overall structure',
    'function of the',
    'role of the',
    "author's purpose",
    'why does the author',
    'how does the structure',
    'serves to',
    'author includes',
  ],
  'Cross-Text Connections': [
    'text 1',
    'text 2',
    'author of text 1',
    'author of text 2',
    'both texts',
    'both authors',
    'how would the author',
    'both passages',
    'compared to text',
    'passage 1',
    'passage 2',
  ],
  'Rhetorical Synthesis': [
    'taking notes',
    'notes on',
    'student wants',
    'wants to emphasize',
    'wants to introduce',
    'accomplish this goal',
    'most effectively accomplishes',
    'draft of an essay',
    'effectively uses relevant',
    'student is writing',
  ],
  'Transitions': [
    'most logically completes',
    'most logical transition',
    'transition word',
    'which sentence',
    'most effective transition',
    'added here',
    'however',
    'therefore',
    'furthermore',
    'in contrast',
    'meanwhile',
    'additionally',
  ],
  'Standard English Conventions': [
    'standard english',
    'conforms to the conventions',
    'punctuation',
    'semicolon',
    'subject-verb agreement',
    'modifier',
    'possessive',
    'apostrophe',
    'sentence boundary',
    'run-on',
    'fragment',
    'verb tense',
    'comma',
  ],
}

// ─── Math keyword signals ─────────────────────────────────────────────────────

const MATH_SIGNALS: Record<string, string[]> = {
  'Algebra': [
    'linear equation',
    'linear inequality',
    'linear function',
    'slope',
    'y-intercept',
    'x-intercept',
    'system of equation',
    'substitution',
    'elimination',
    'linear model',
    'two variables',
    'slope-intercept',
    'solve for x',
    'solve for y',
  ],
  'Advanced Math': [
    'polynomial',
    'quadratic',
    'quadratic equation',
    'quadratic function',
    'f(x)',
    'g(x)',
    'zeros of',
    'roots of',
    'vertex',
    'parabola',
    'exponential',
    'nonlinear',
    'factored form',
    'completing the square',
    'discriminant',
    'complex number',
    'simplify the expression',
    'equivalent expression',
    'rewrite the expression',
  ],
  'Problem-Solving and Data Analysis': [
    'probability',
    'percent',
    'percentage',
    'ratio',
    'rate',
    'proportion',
    'mean',
    'median',
    'mode',
    'average',
    'statistics',
    'survey',
    'sample',
    'population',
    'scatterplot',
    'correlation',
    'unit conversion',
    'statistical claim',
    'margin of error',
    'expected value',
    'relative frequency',
  ],
  'Geometry and Trigonometry': [
    'triangle',
    'angle',
    'area of',
    'volume of',
    'circle',
    'radius',
    'diameter',
    'circumference',
    'arc',
    'rectangle',
    'perimeter',
    'surface area',
    'right triangle',
    'sine',
    'cosine',
    'tangent',
    ' sin ',
    ' cos ',
    ' tan ',
    'hypotenuse',
    'similar triangle',
    'congruent',
    'inscribed',
    'polygon',
  ],
}

// ─── Math regex fallback for short/equation-only questions ───────────────────

const MATH_REGEX_FALLBACK: Array<[RegExp, string]> = [
  [/\bsin\b|\bcos\b|\btan\b|\bsine\b|\bcosine\b|\btangent\b|\bhypotenuse\b/i, 'Geometry and Trigonometry'],
  [/\btriangle\b|\bcircle\b|\bradius\b|\bdiameter\b|\bperimeter\b/i, 'Geometry and Trigonometry'],
  [/\bprobability\b|\bpercent(?:age)?\b|\bproportion\b|\bscatterplot\b|\bmargin of error\b/i, 'Problem-Solving and Data Analysis'],
  [/\bf\s*\(\s*x\s*\)|\bquadratic\b|\bpolynomial\b|\bparabola\b|\bdiscriminant\b|\bexponential\b/i, 'Advanced Math'],
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const UNKNOWN_VALUES = new Set(['', 'unknown', 'none', 'n/a', 'uncategorized'])

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

function hitConfidence(hits: number): Confidence {
  if (hits >= 3) return 'high'
  if (hits >= 1) return 'medium'
  return 'low'
}

function scoreText(normalizedText: string, keywords: string[]): number {
  let hits = 0
  for (const kw of keywords) {
    if (normalizedText.includes(kw.toLowerCase())) hits++
  }
  return hits
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Classify a single SAT question into a skill category.
 *
 * @param text           Raw question text (HTML tags are stripped automatically)
 * @param subject        'reading_writing' | 'math'
 * @param existingDomain If already categorized (e.g. from the scraper), pass it
 *                       here to skip classification and return it directly.
 */
export function classifyQuestion(
  text: string,
  subject: Subject,
  existingDomain?: string,
): ClassifyResult {
  // Pass through already-known categories
  if (existingDomain && !UNKNOWN_VALUES.has(existingDomain.toLowerCase().trim())) {
    return { category: existingDomain.trim(), confidence: 'high', score: 10 }
  }

  const normalized = stripHtml(text)

  if (!normalized) {
    return { category: 'Uncategorized', confidence: 'low', score: 0 }
  }

  // Math regex fallback: catches short equations before keyword scoring
  if (subject === 'math' && normalized.length < 300) {
    for (const [pattern, category] of MATH_REGEX_FALLBACK) {
      if (pattern.test(normalized)) {
        return { category, confidence: 'medium', score: 2 }
      }
    }
  }

  const signals = subject === 'math' ? MATH_SIGNALS : RW_SIGNALS

  let bestCategory = 'Uncategorized'
  let bestScore = 0

  for (const [category, keywords] of Object.entries(signals)) {
    const score = scoreText(normalized, keywords)
    if (score > bestScore) {
      bestScore = score
      bestCategory = category
    }
  }

  if (bestScore === 0) {
    return { category: 'Uncategorized', confidence: 'low', score: 0 }
  }

  return {
    category: bestCategory,
    confidence: hitConfidence(bestScore),
    score: bestScore,
  }
}

/**
 * Classify a batch of questions. Tries both subjects and picks the best match
 * when subject is unknown (used in backfill).
 */
export function classifyBatch(
  questions: Array<{ text: string; subject: Subject; domain?: string }>,
): ClassifyResult[] {
  return questions.map((q) => classifyQuestion(q.text, q.subject, q.domain))
}

/**
 * Derive subject from a module name string.
 * e.g. "Module 1: Math" → 'math', "Reading & Writing Module 1" → 'reading_writing'
 */
export function subjectFromModule(module: string): Subject {
  return /math/i.test(module) ? 'math' : 'reading_writing'
}

/**
 * Canonical list of all 14 SAT skill categories, keyed by subject.
 * Used to seed the tags table and to validate category names.
 */
export const SAT_CATEGORIES: Record<Subject, string[]> = {
  reading_writing: [
    'Words in Context',
    'Central Ideas and Details',
    'Command of Evidence – Textual',
    'Command of Evidence – Quantitative',
    'Inferences',
    'Text Structure and Purpose',
    'Cross-Text Connections',
    'Rhetorical Synthesis',
    'Transitions',
    'Standard English Conventions',
  ],
  math: [
    'Algebra',
    'Advanced Math',
    'Problem-Solving and Data Analysis',
    'Geometry and Trigonometry',
  ],
}
