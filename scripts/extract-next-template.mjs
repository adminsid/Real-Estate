// Mechanical extraction of the supplied prototype's data literals; never execute its page scripts.
import { readFileSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'
const file = process.argv[2]
if (!file) throw new Error('Usage: node scripts/extract-next-template.mjs <prototype.html>')
const html = readFileSync(file, 'utf8')
const phasesLiteral = html.match(/window\.DEFAULT_PHASES = (\[[\s\S]*?\n\]);/)?.[1]
const checkinsLiteral = html.match(/const CHECKIN = (\{[\s\S]*?\n\});/)?.[1]
const outcomesLiteral = html.match(/const CHECKIN_OUTCOMES = (\[[\s\S]*?\n\]);/)?.[1]
if (!phasesLiteral || !checkinsLiteral || !outcomesLiteral) throw new Error('Prototype format changed')
const literal = value => vm.runInNewContext(`(${value})`, Object.create(null), { timeout: 1000 })
const checkins = literal(checkinsLiteral), outcomes = literal(outcomesLiteral)
const phases = literal(phasesLiteral).map((p, pi) => ({
  id: ['prelisting', 'marketing', 'contract', 'closing'][pi], name: p.name,
  milestones: p.milestones.map((m, mi) => ({
    id: `seller-v1-${pi}-${mi}`, name: m.checkin ? `${m.checkin} Day Check-in` : m.name,
    description: m.checkin ? checkins[m.checkin].desc : m.description,
    outcomes: (m.checkin ? outcomes : m.outcomes).map((name, oi) => ({
      id: `seller-v1-${pi}-${mi}-${oi}`, name, description: '', done: false, hidden: false,
      ...(name === 'Offer accepted' ? { gateway: true } : {}),
      ...(['Offer accepted', 'Signing of final documents'].includes(name) ? { star: true } : {}),
    })), hidden: false,
  })),
}))
writeFileSync(new URL('../src/domain/next-seller-template.json', import.meta.url), JSON.stringify(phases, null, 2) + '\n')
console.log(JSON.stringify({ phases: phases.length, milestones: phases.flatMap(p => p.milestones).length, outcomes: phases.flatMap(p => p.milestones.flatMap(m => m.outcomes)).length }))
