#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { isMap, parseDocument } from 'yaml';

const usage = `Usage: skill-doctor [project-directory]
       skill-doctor --personal

Check <project-directory>/.claude/skills (default: current directory).
Use --personal to check skills in CLAUDE_CONFIG_DIR or ~/.claude.
Exit codes: 0 checks passed, 1 installation needs attention, 2 usage or read error.`;

function report(level, message) {
  // Paths and YAML fields can contain terminal control characters.
  console.log(level, message.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' '));
  if (level === 'FIX') process.exitCode = 1;
}

function checkFile(path, folder) {
  const lines = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  let fields;
  let bodyStart = 0;
  if (/^---\s*$/.test(lines[0])) {
    const end = lines.findIndex((line, i) => i > 0 && /^---\s*$/.test(line));
    if (end < 0) {
      report('FIX', `${path}: close the YAML header with --- on its own line.`);
      return;
    }
    const doc = parseDocument(lines.slice(1, end).join('\n'));
    if (doc.errors.length) {
      const error = doc.errors[0];
      report('FIX', `${path}:${(error.linePos?.[0]?.line ?? 1) + 1}: correct the YAML header (${error.code}). Claude may ignore these settings.`);
      return;
    }
    if (doc.contents !== null && !isMap(doc.contents)) {
      report('FIX', `${path}: write header fields as YAML key/value pairs, for example "name: ${folder}".`);
      return;
    }
    fields = doc.toJS();
    bodyStart = end + 1;
  }
  for (const key of ['name', 'description']) {
    if (fields && Object.hasOwn(fields, key) && (typeof fields[key] !== 'string' || !fields[key].trim())) {
      report('FIX', `${path}: set ${key} to nonempty text or remove it to use Claude's default.`);
      return;
    }
  }
  if (!lines.slice(bodyStart).join('\n').trim()) {
    report('FIX', `${path}: add instructions in the Markdown body.`);
    return;
  }
  const name = fields?.name ?? folder;
  if (['false', 'no', 'off', '0'].includes(String(fields?.['user-invocable']).toLowerCase())) {
    report('INFO', `${path}: user-invocable hides /${name}. Remove that field to show the command.`);
  } else {
    report('OK', `/${name} — ${path}`);
  }
  if (!fields?.description) report('INFO', `/${name}: Claude uses the first nonempty instruction line as the description.`);
}

function checkFolder(root, folder) {
  const dir = join(root, folder);
  const files = readdirSync(dir);
  if (!files.includes('SKILL.md')) {
    const wrong = files.find(name => /^skill\.md(?:\.txt)?$/i.test(name));
    if (wrong) report('FIX', `${dir}: rename ${wrong} to SKILL.md for portable discovery.`);
    else if (files.includes(folder) && statSync(join(dir, folder, 'SKILL.md'), { throwIfNoEntry: false })?.isFile()) {
      report('FIX', `Move ${join(dir, folder, 'SKILL.md')} and its supporting files up one directory into ${dir}.`);
    } else report('FIX', `${dir}: place the skill entry file at ${join(dir, 'SKILL.md')}.`);
    return;
  }
  const path = join(dir, 'SKILL.md');
  if (!statSync(path, { throwIfNoEntry: false })?.isFile()) {
    report('FIX', `${path}: replace this entry with a readable Markdown file.`);
    return;
  }
  checkFile(path, folder);
}

function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return console.log(usage);
  const personal = args[0] === '--personal';
  if (args.length > 1 || (!personal && args[0]?.startsWith('-'))) {
    console.error(usage);
    process.exitCode = 2;
    return;
  }
  const project = resolve(args[0] ?? '.');
  if (!personal && !statSync(project, { throwIfNoEntry: false })?.isDirectory()) {
    console.error('Choose an existing project directory.');
    process.exitCode = 2;
    return;
  }
  const root = personal
    ? resolve(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'skills')
    : join(project, '.claude', 'skills');
  const rootStat = statSync(root, { throwIfNoEntry: false });
  if (rootStat && !rootStat.isDirectory()) return report('FIX', `${root} must be a directory containing one folder per skill.`);
  const entries = rootStat ? readdirSync(root, { withFileTypes: true }) : [];
  let candidates = 0;
  for (const entry of entries) {
    if (entry.name.startsWith('.') || (personal && entry.name.toLowerCase() === 'synced')) continue;
    const path = join(root, entry.name);
    const stat = entry.isSymbolicLink() ? statSync(path, { throwIfNoEntry: false }) : entry;
    if (!stat) {
      candidates++;
      report('FIX', `${path}: repair the broken link or reinstall the skill.`);
    } else if (stat.isDirectory()) {
      candidates++;
      if (['synced', 'anthropic-skills'].includes(entry.name.toLowerCase())) {
        report('FIX', `${path}: rename the skill folder to a non-reserved name.`);
      } else checkFolder(root, entry.name);
    } else if (/^skill\.md(?:\.txt)?$/i.test(entry.name)) {
      candidates++;
      report('FIX', `Move ${path} to ${join(root, '<skill-name>', 'SKILL.md')}.`);
    }
  }
  if (!candidates) {
    const source = !personal && [project, join(project, basename(project))].find(dir =>
      statSync(join(dir, 'SKILL.md'), { throwIfNoEntry: false })?.isFile());
    if (source) report('FIX', `Found an uninstalled skill at ${source}. Copy its SKILL.md and supporting files to ${join(root, basename(source))}.`);
    else report('FIX', `No local skills found in ${root}. Install a skill at ${join(root, '<skill-name>', 'SKILL.md')}.`);
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  report('ERROR', error.message);
  process.exitCode = 2;
}
