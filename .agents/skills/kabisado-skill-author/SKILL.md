---
name: kabisado-skill-author
description: >
  Creates, updates, reviews, and tests custom workspace skills for the Kabisado
  project following the Claude Skills guide (SKILL.md anatomy, progressive
  disclosure, trigger-rich descriptions, imperative instructions, and evals).
  Use this skill whenever the user asks to create a new skill, update an
  existing skill in .agents/skills/, audit a SKILL.md, add evals to a skill, or
  package a skill for Kabisado. Do not use for general app feature coding or
  deployment tasks.
---

# Kabisado Skill Author

Create and maintain lean, reliable workspace skills in `.agents/skills/<skill-name>/` that trigger at the right time and encode real Kabisado workflows.

## When this applies
- Creating a new Kabisado workspace skill
- Updating or tightening an existing skill's `SKILL.md` or `references/`
- Adding `evals/` test cases to verify a skill's output

## Anatomy of a skill
```text
.agents/skills/<skill-name>/
├── SKILL.md              (required: YAML frontmatter + concise markdown < 500 lines)
├── references/           (optional: detailed docs loaded only when needed)
├── scripts/              (optional: deterministic helper scripts)
├── assets/               (optional: templates or static files used in output)
└── evals/                (optional: realistic test prompts + graders)
    └── <case-name>/
        ├── prompt.md
        ├── case.yaml
        └── graders/
```

## Workflow

1. **Scope the skill to substantive, repeatable work.**
   - Don't create a skill for trivial one-step tasks or generic language advice. Focus on Kabisado-specific procedures, invariants, or style rules.
   - If updating an existing skill, keep its original folder name and `name` field unchanged (never append `-v2`).

2. **Write a pushy, specific `description` in YAML frontmatter.**
   - All "when to use" triggers belong in `description`, because the body is only loaded after the skill triggers.
   - State what it does, list concrete trigger phrases and near-miss cases, and add a `"Do not use for ..."` clause when a neighboring skill exists.

3. **Write a lean, imperative `SKILL.md` body (under 500 lines).**
   - Use imperative verbs ("Run", "Check", "Return") and explain **why** each rule matters so the agent can handle edge cases cleanly.
   - Push bulky checklists, matrices, or reference banks into `references/` and link to them with clear conditions ("Read `references/foo.md` when..."). Add a table of contents to any reference file over ~300 lines.
   - Include an explicit **Output format**, at least one **Example**, and **Edge cases**.

4. **Test with 2–3 realistic prompts (when output is checkable).**
   - Add `evals/<case-name>/prompt.md` and `case.yaml` for skills with structured or rule-checked outputs.
   - Review the skill against the checklist below and cut anything that doesn't change agent behavior.

## Output format
After creating or updating a skill, report:
```markdown
## Skill created/updated: `<skill-name>`
- **Path:** `.agents/skills/<skill-name>/SKILL.md`
- **Triggers:** brief summary of when it activates
- **Checklist:** pass/fail against the Quick Checklist
```

## Examples

**Example 1:**
Input: "Create a skill for writing Kabisado Alembic migrations safely."
Output: Creates `.agents/skills/kabisado-migrations/SKILL.md` with frontmatter `name: kabisado-migrations`, a trigger-rich description covering schema changes and `alembic revision`, imperative steps covering SQLite + Postgres compatibility and `test_migrations.py`, an example migration workflow, and edge cases (one-way migrations like `0002`).

## Edge cases
- **Dual tool compatibility (Antigravity + Claude Code):** Antigravity auto-discovers `.agents/skills/*/SKILL.md`. If the user also uses Claude Code, the same skill folders can be mirrored to `.claude/skills/` or packaged via `python -m scripts.package_skill <path/to/skill-folder>`.
- **Safety:** A skill must never surprise the user relative to its description or include secrets, exploit code, or destructive commands without explicit confirmation.

## Quick checklist
- [ ] `name` (lowercase, hyphens) and `description` are in YAML frontmatter
- [ ] `description` states what it does, when to use it, trigger phrases, and exclusions
- [ ] `SKILL.md` body is under 500 lines with bulky details in `references/`
- [ ] Instructions use imperative form and explain the reasoning
- [ ] Output format, examples, and edge cases are included
- [ ] Original name preserved if updating an existing skill
- [ ] Nothing in the skill would surprise the user
