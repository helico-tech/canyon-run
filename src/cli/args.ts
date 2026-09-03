/** Minimal --flag [value] parser shared by the CLI and the headless tools. */
export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[a.slice(2)] = next;
        i++;
      } else out[a.slice(2)] = 'true';
    }
  }
  return out;
}
