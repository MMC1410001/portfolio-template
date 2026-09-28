/**
 * `npm run test:py`: the Python half of the answer contract, on any OS.
 *
 * This was a shell one-liner (`P=python3; [ -x .venv/bin/python ] && …`),
 * which npm runs through cmd.exe on Windows, where none of it parses, and
 * where a venv's interpreter is `.venv\Scripts\python.exe` rather than
 * `.venv/bin/python` anyway. So: prefer the repo's venv on either layout,
 * fall back to whatever Python is on PATH, and pass unittest's exit code
 * through so `npm test` still stops on a failure.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const venv = process.platform === 'win32'
  ? join('.venv', 'Scripts', 'python.exe')
  : join('.venv', 'bin', 'python');

// `py` is the Windows launcher, present even when `python` is the Store stub.
const candidates = existsSync(venv)
  ? [venv]
  : process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];

const args = ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', ...process.argv.slice(2)];

for (const python of candidates) {
  const run = spawnSync(python, args, { stdio: 'inherit' });
  if (run.error && run.error.code === 'ENOENT') continue; // not installed, try the next
  if (run.error) throw run.error;
  process.exit(run.status ?? 1);
}

console.error(
  'No Python found. Create the venv first:\n' +
    '  python -m venv .venv\n' +
    `  ${venv} -m pip install --require-hashes -r backend/requirements-lock.txt`,
);
process.exit(1);
