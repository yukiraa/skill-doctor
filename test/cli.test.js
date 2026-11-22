import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/skill-doctor.js', import.meta.url));
function fixture(t, relativePath, content) {
  const project = mkdtempSync(join(tmpdir(), 'skill-doctor-test-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  if (relativePath) {
    const path = join(project, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return (...args) => spawnSync(process.execPath, [cli, ...args], {
    cwd: project, encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: join(project, 'profile') }
  });
}

const dir = '.claude/skills/demo/';
for (const [label, file, body, status, expected] of [
  ['multiline description and CRLF', dir + 'SKILL.md', '---\r\nname: review\r\ndescription: >-\r\n  Review changes.\r\n---\r\nRead the diff.', 0, /OK \/review/],
  ['optional metadata', dir + 'SKILL.md', 'Review changes.', 0, /OK \/demo/],
  ['hidden command', dir + 'SKILL.md', '---\nuser-invocable: false\n---\nReview changes.', 0, /user-invocable hides \/demo/],
  ['wrong filename', dir + 'skill.md.txt', 'Review changes.', 1, /rename skill.md.txt to SKILL.md/],
  ['extra folder after unzipping', dir + 'demo/SKILL.md', 'Review changes.', 1, /up one directory/],
  ['loose entry', '.claude/skills/SKILL.md', 'Review changes.', 1, /Move .*<skill-name>/],
  ['malformed YAML', dir + 'SKILL.md', '---\nname: [bad\n---\nRun.', 1, /correct the YAML header/],
  ['missing delimiter', dir + 'SKILL.md', '---\nname: demo\nRun.', 1, /close the YAML header/],
  ['list instead of text', dir + 'SKILL.md', '---\ndescription: [bad]\n---\nRun.', 1, /set description to nonempty text/],
  ['no instructions', dir + 'SKILL.md', '---\nname: demo\n---\n', 1, /add instructions/],
  ['empty project', null, null, 1, /No local skills found/],
  ['uninstalled source', 'SKILL.md', 'Run.', 1, /Found an uninstalled skill/]
]) {
  test(label, t => {
    const result = fixture(t, file, body)();
    assert.equal(result.status, status, result.stderr + result.stdout);
    assert.match(result.stdout, expected);
  });
}

test('personal mode uses the configured profile', t => {
  const run = fixture(t, 'profile/skills/example/SKILL.md', 'Run.');
  assert.match(run('--personal').stdout, /OK \/example/);
  assert.equal(run().status, 1);
  assert.equal(run('--unknown').status, 2);
});
