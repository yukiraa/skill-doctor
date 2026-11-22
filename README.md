# Skill Doctor

Find out why a locally installed Claude Code skill is missing from the slash-command menu. Skill Doctor reads the installation on disk and suggests a specific fix. No Claude subscription or API key is needed.

## Run

With Node.js 20 or later, npm, and Git installed, download the tool once into a tools directory:

```sh
git clone --branch v0.1.1 --depth 1 https://github.com/yukiraa/skill-doctor.git
cd skill-doctor
npm ci --ignore-scripts
```

Then run either check from that checkout. Replace `../my-project` with the folder you open in Claude Code:

```sh
node bin/skill-doctor.js ../my-project
node bin/skill-doctor.js --personal
```

Personal mode honors `CLAUDE_CONFIG_DIR` and otherwise uses `~/.claude/skills`.

## Example

A ZIP extracted one folder too deep produces this diagnostic:

```text
FIX Move /work/app/.claude/skills/review/review/SKILL.md and its supporting files up one directory into /work/app/.claude/skills/review.
```

After moving the files, rerun the same command. A healthy installation produces:

```text
OK /review — /work/app/.claude/skills/review/SKILL.md
```

## Checks

Skill Doctor checks the selected project's `.claude/skills` directory or the personal skills directory. It spots misplaced files, filename casing or hidden `.txt` extensions, broken skill links, malformed YAML, and empty instructions. It explains when `user-invocable` hides a valid command. Missing `name` or `description` is allowed.

An `OK` means the local files passed these checks. Managed settings, plugins, parent directories, synced skills, and behavior inside a running model session are outside this check. See the [Claude Code skill documentation](https://code.claude.com/docs/en/skills) for discovery and precedence rules.

The command exits with `0` when checks pass, `1` when an installation needs attention, or `2` for a usage or read error.

## Development

```sh
npm ci
npm test
node bin/skill-doctor.js --help
```

Released under the [MIT license](LICENSE).
