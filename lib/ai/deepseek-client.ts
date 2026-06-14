import OpenAI from 'openai'

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_TIMEOUT_MS = 60_000

export function createDeepSeekClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY chưa được cấu hình.')
  }

  return new OpenAI({
    apiKey,
    baseURL: DEEPSEEK_BASE_URL,
    timeout: DEFAULT_TIMEOUT_MS,
  })
}

