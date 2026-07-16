import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function jsonFiles(directory) {
  const results = []
  const visit = async (path) => {
    let entries
    try { entries = await readdir(path, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const candidate = join(path, entry.name)
      if (entry.isDirectory()) await visit(candidate)
      else if (entry.name.endsWith('.json') && entry.name !== 'results.json' && entry.name !== '.last-run.json') results.push(candidate)
    }
  }
  await visit(directory)
  return results
}

async function reports(directory) {
  const output = new Map()
  for (const file of await jsonFiles(directory)) {
    try {
      const report = JSON.parse(await readFile(file, 'utf8'))
      if (typeof report.fixture === 'string' && report.snapshot?.durations) output.set(report.fixture, report)
    } catch { /* Ignore unrelated or incomplete artifact JSON. */ }
  }
  return output
}

function value(report, metric) {
  if (!report) return null
  if (metric === 'ready') return report.readyMs
  return report.snapshot.durations[metric]?.p95Ms ?? null
}

function display(current, previous) {
  if (current === null) return '—'
  if (previous === null || previous === 0) return `${current.toFixed(1)} ms`
  const delta = (current - previous) / previous * 100
  return `${current.toFixed(1)} ms (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%)`
}

const [currentDirectory = 'test-results/performance', baselineDirectory = '.performance-baseline'] = process.argv.slice(2)
const current = await reports(currentDirectory)
const baseline = await reports(baselineDirectory)

console.log('## Studio browser performance')
console.log('')
if (!current.size) {
  console.log('No current benchmark reports were produced.')
  process.exit(0)
}
console.log('| Fixture | Ready | Render p95 | Pointer p95 | Save p95 |')
console.log('| --- | ---: | ---: | ---: | ---: |')
for (const fixture of [...current.keys()].sort((left, right) => left.localeCompare(right))) {
  const report = current.get(fixture)
  const previous = baseline.get(fixture)
  console.log(`| ${fixture} | ${display(value(report, 'ready'), value(previous, 'ready'))} | ${display(value(report, 'render'), value(previous, 'render'))} | ${display(value(report, 'pointer-latency'), value(previous, 'pointer-latency'))} | ${display(value(report, 'save'), value(previous, 'save'))} |`)
}
console.log('')
console.log(baseline.size ? 'Percentages compare with the latest successful `main` CI artifact.' : 'No successful `main` baseline artifact was available; this run establishes one.')
