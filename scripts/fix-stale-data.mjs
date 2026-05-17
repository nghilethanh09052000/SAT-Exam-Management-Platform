#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const write = process.argv.includes('--write')
const roots = ['app', 'components']
const exts = new Set(['.ts', '.tsx'])
const mutationMethod = /method:\s*['\"](?:POST|PATCH|PUT|DELETE)['\"]/
const navigation = /^\s*router\.(?:push|replace)\(/

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return exts.has(path.extname(entry.name)) ? [full] : []
  })
}

const findings = []
for (const relRoot of roots) {
  for (const file of walk(path.join(root, relRoot))) {
    let source = fs.readFileSync(file, 'utf8')
    if (!source.includes("'use client'") && !source.includes('"use client"')) continue
    if (!mutationMethod.test(source)) continue

    const lines = source.split('\n')
    let changed = false
    for (let i = 0; i < lines.length; i++) {
      if (!navigation.test(lines[i])) continue
      const recentContext = lines.slice(Math.max(0, i - 60), i + 1).join('\n')
      if (!mutationMethod.test(recentContext)) continue
      const nearby = lines.slice(i + 1, i + 4).join('\n')
      if (/router\.refresh\(/.test(nearby)) continue

      findings.push({ file: path.relative(root, file), line: i + 1, code: lines[i].trim() })
      if (write) {
        const indent = lines[i].match(/^\s*/)?.[0] ?? ''
        lines.splice(i + 1, 0, `${indent}router.refresh()`)
        changed = true
        i++
      }
    }

    if (write && changed) fs.writeFileSync(file, lines.join('\n'))
  }
}

if (findings.length === 0) {
  console.log('No mutation-followed navigation without router.refresh() found.')
  process.exit(0)
}

if (write) {
  console.log(`Added router.refresh() after ${findings.length} mutation-followed navigation(s):`)
} else {
  console.log('Potential stale-data navigation(s) found:')
}
for (const finding of findings) {
  console.log(`- ${finding.file}:${finding.line}  ${finding.code}`)
}
if (!write) process.exitCode = 1
