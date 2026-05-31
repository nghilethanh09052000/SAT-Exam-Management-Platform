import {
  SAT_MATH_MODULE_SECONDS,
  SAT_READING_WRITING_MODULE_SECONDS,
  compareSatModules,
  getSatModuleDurationSeconds,
  getSatModuleSubject,
} from '@/lib/sat-test'

describe('SAT test helpers', () => {
  it('orders Reading and Writing modules before Math modules', () => {
    const modules = [
      'Math Module 2',
      'Reading & Writing Module 2',
      'Math Module 1',
      'Reading & Writing Module 1',
    ]

    expect([...modules].sort(compareSatModules)).toEqual([
      'Reading & Writing Module 1',
      'Reading & Writing Module 2',
      'Math Module 1',
      'Math Module 2',
    ])
  })

  it('detects SAT module subjects and durations', () => {
    expect(getSatModuleSubject('Module 1: Reading and Writing')).toBe('reading-writing')
    expect(getSatModuleSubject('Module 2: Math')).toBe('math')
    expect(getSatModuleDurationSeconds('Module 1: Reading and Writing')).toBe(SAT_READING_WRITING_MODULE_SECONDS)
    expect(getSatModuleDurationSeconds('Module 2: Math')).toBe(SAT_MATH_MODULE_SECONDS)
  })
})
