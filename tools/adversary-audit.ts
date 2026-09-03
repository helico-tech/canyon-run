// Fairness audit and behavioural check for adversaries.
//   node tools/adversary-audit.ts [--seeds 1-8] [--length 10000] [--no-fly]
import { parseArgs } from '../src/cli/args.ts';
import { auditWorld } from '../src/sim/adversaryAudit.ts';
import { createPilot } from '../src/sim/pilot.ts';
import { createState } from '../src/sim/state.ts';
import { step, StepScratch } from '../src/sim/step.ts';
import { biomeModes } from '../src/terrain/biomes.ts';

const f = parseArgs(process.argv.slice(2));
const [a, b] = (f.seeds ?? '1-8').split('-').map(Number);
const length = Number(f.length ?? 10000);
let failed = 0;
console.log('seed  mode                  stations  failures  worstFreeCells  worstStation');
for (let seed = a!; seed <= (b ?? a!); seed++) {
  for (const m of [
    { name: 'auto', mode: 0 },
    ...biomeModes().filter((x) => x.name !== 'auto' && x.name !== 'canyon'),
  ]) {
    if (m.name !== 'auto' && seed > a! + 2) continue; // forced modes: first three seeds only
    const r = auditWorld(seed, m.mode, 0, length);
    failed += r.failures.length;
    const w = r.worst ? `${r.worst.shape}/${r.worst.motion} z ${Math.round(r.worst.z)}` : '-';
    console.log(
      `${String(seed).padEnd(5)} ${m.name.padEnd(21)} ${String(r.stations).padStart(8)}  ${String(r.failures.length).padStart(8)}  ${String(r.worst?.worstFreeCells ?? '-').padStart(14)}  ${w}`,
    );
    for (const x of r.failures)
      console.log(`      FAIL ${x.shape}/${x.motion} z ${Math.round(x.z)}: ${x.reason}`);
  }
}
if (f['no-fly'] !== 'true') {
  console.log('\nbehavioural check: dodging pilot at full throttle');
  for (let seed = a!; seed <= (b ?? a!); seed++) {
    const s = createState(seed);
    const sc = new StepScratch(seed);
    const pilot = createPilot(seed, { throttle: 'full' });
    let dodged = 0;
    let ticks = 0;
    while (s.alive && s.z < length && ticks < 20000) {
      step(s, pilot(s), sc);
      ticks++;
      if (s.eventId === 5 && s.eventTick === s.tick - 1) dodged++;
    }
    console.log(
      `seed ${seed}: alive ${s.alive} z ${Math.round(s.z)} ticks ${ticks} dodged ${dodged} score ${s.score}`,
    );
    if (!s.alive) failed++;
  }
}
console.log(failed ? `\naudit FAILED (${failed})` : '\naudit ok');
process.exit(failed ? 1 : 0);
