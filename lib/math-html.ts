import katex from 'katex'

function tryKatex(latex: string, displayMode: boolean): string | null {
  try {
    const rendered = katex.renderToString(latex.trim(), {
      displayMode,
      throwOnError: false,
      output: 'html',
    })
    // KaTeX marks unknown commands with katex-error; fall back to raw text
    return rendered.includes('katex-error') ? null : rendered
  } catch {
    return null
  }
}

function processTextNode(text: string): string {
  // $$...$$ display math (must come before $...$)
  text = text.replace(/\$\$([^$]+)\$\$/g, (original, math) => {
    return tryKatex(math, true) ?? original
  })

  // $...$ inline math
  text = text.replace(/\$([^$\n]{1,300})\$/g, (original, math) => {
    return tryKatex(math, false) ?? original
  })

  // Bare LaTeX commands: \command followed by zero or more {arg} groups (one level of nesting)
  // e.g. \frac{2}{3}, \sqrt{x}, \sqrt{\frac{}{}}, \alpha
  text = text.replace(/\\[a-zA-Z]+(?:\{(?:[^{}]|\{[^{}]*\})*\})*/g, (latex) => {
    return tryKatex(latex, false) ?? latex
  })

  return text
}

/**
 * Process an HTML string, rendering any LaTeX found in text nodes into KaTeX HTML.
 * Supports: $$...$$, $...$, and bare \commands like \frac{2}{3}.
 * Safe to call on both server and client.
 */
export function renderMathInHtml(html: string): string {
  if (!html) return html

  // Split on HTML tags (capturing group keeps the tags in the result array)
  const parts = html.split(/(<[^>]*>)/)

  return parts
    .map((part) => {
      // HTML tags: leave untouched (avoids mangling src="..." attributes etc.)
      if (part.startsWith('<')) return part
      return processTextNode(part)
    })
    .join('')
}
