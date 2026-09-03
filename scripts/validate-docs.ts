// Push validation for the knowledge base: layout, frontmatter, status and priority values.
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './lib/frontmatter.ts';
import { repoRoot } from './lib/repo.ts';
import { PRIORITIES, STATUSES } from './issues.ts';

export const DECLARED_DIRS = [
  'adr',
  'specs',
  'work',
  'issues',
  'domain',
  'context',
  'research',
  'evidence',
];
const WORK_STATUSES = ['todo', 'in-progress', 'done'];
const DATED = /^\d{4}-\d{2}-\d{2}-/;

export function validateDocs(docsDir: string): string[] {
  const errors: string[] = [];
  for (const entry of fs.readdirSync(docsDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!DECLARED_DIRS.includes(entry.name))
        errors.push(`docs/${entry.name}: not in the declared layout (${DECLARED_DIRS.join(', ')})`);
    } else if (entry.name !== 'README.md')
      errors.push(`docs/${entry.name}: only README.md may sit at the docs root`);
  }
  const check = (sub: string, fn: (name: string, text: string) => void) => {
    const dir = path.join(docsDir, sub);
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir))
      if (name.endsWith('.md')) fn(name, fs.readFileSync(path.join(dir, name), 'utf8'));
  };
  check('issues', (name, text) => {
    const doc = parseFrontmatter(text);
    if (!doc) return void errors.push(`issues/${name}: missing or malformed frontmatter`);
    if (!DATED.test(name)) errors.push(`issues/${name}: filename must start with YYYY-MM-DD-`);
    const { status, priority, filed, work } = doc.data;
    if (!status || !(STATUSES as readonly string[]).includes(status))
      errors.push(`issues/${name}: status must be one of ${STATUSES.join('|')}`);
    if (!priority || !(PRIORITIES as readonly string[]).includes(priority))
      errors.push(`issues/${name}: priority must be one of ${PRIORITIES.join('|')}`);
    if (!filed || !/^\d{4}-\d{2}-\d{2}$/.test(filed))
      errors.push(`issues/${name}: filed must be YYYY-MM-DD`);
    if (status === 'triaged' && !work)
      errors.push(`issues/${name}: triaged issues need a work: link`);
    if (work && !/^CR-\d{4}$/.test(work))
      errors.push(`issues/${name}: work must look like CR-0004`);
  });
  check('work', (name, text) => {
    const doc = parseFrontmatter(text);
    if (!doc) return void errors.push(`work/${name}: missing or malformed frontmatter`);
    const id = /^((?:CR-\d{4})|(?:EPIC-\d{2}))-/.exec(name)?.[1];
    if (!id) return void errors.push(`work/${name}: filename must start with CR-NNNN- or EPIC-NN-`);
    if (doc.data.id !== id)
      errors.push(`work/${name}: id: ${doc.data.id ?? '(none)'} does not match filename ${id}`);
    if (!doc.data.status || !WORK_STATUSES.includes(doc.data.status))
      errors.push(`work/${name}: status must be one of ${WORK_STATUSES.join('|')}`);
    if (id.startsWith('CR-') && !/^EPIC-\d{2}$/.test(doc.data.epic ?? ''))
      errors.push(`work/${name}: stories need epic: EPIC-NN`);
  });
  for (const sub of ['adr', 'specs']) {
    check(sub, (name) => {
      if (!DATED.test(name)) errors.push(`${sub}/${name}: filename must start with YYYY-MM-DD-`);
      if (sub === 'adr' && !/^\d{4}-\d{2}-\d{2}-\d{4}-/.test(name))
        errors.push(`adr/${name}: needs a 4-digit sequence after the date`);
    });
  }
  return errors;
}

if (import.meta.main) {
  const errors = validateDocs(path.join(repoRoot, 'docs'));
  for (const e of errors) console.error(`docs: ${e}`);
  if (errors.length) process.exit(1);
  console.log('docs: ok');
}
