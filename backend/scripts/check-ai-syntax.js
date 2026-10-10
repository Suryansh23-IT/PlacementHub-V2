import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(`${directory}/${entry.name}`) : `${directory}/${entry.name}`))).flat().filter(file => file.endsWith('.js'))
}
const targets = [...await files('src/modules/ai'), 'src/config/env.js', 'src/config/ai-scoring.js', 'scripts/check-ai-connectivity.js', 'scripts/check-ai-syntax.js', 'scripts/benchmark-ollama.js', 'test/ollama-provider.test.js', 'test/ai-foundation.test.js', 'test/ai-http.test.js', 'test/ai-archived.test.js', 'test/student-ai.test.js', 'test/company-ai.test.js', 'test/resume-text.test.js']
for (const file of targets) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) { console.error(result.stderr); process.exit(1) }
}
console.info(`AI syntax: ${targets.length}/${targets.length} files passed.`)
