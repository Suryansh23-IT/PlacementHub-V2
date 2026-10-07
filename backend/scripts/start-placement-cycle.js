import dotenv from 'dotenv'

const cycle = process.argv[2]
if (!['2026', '2027'].includes(cycle)) throw new Error('Choose placement cycle 2026 or 2027.')

const loaded = dotenv.config({ path: `.env.cycle-${cycle}`, override: true })
if (loaded.error) throw new Error(`Create backend/.env.cycle-${cycle} from its .example file before starting this cycle.`)

await import('../src/server.js')
