---
name: kabisado-brand-copy
description: >
  Writes and reviews UI microcopy, empty states, toast notifications, quiz score
  reports, Kabi mascot dialogue, and student-facing messages in Kabisado's
  signature Taglish-meets-serious-study voice. Use this skill whenever the user
  asks to write, rewrite, localize, or polish copy, labels, empty states,
  toasts, onboarding text, mascot lines, or error messages in Kabisado — even if
  they just say "make this sound more Kabisado" or "add a friendly message."
  Do not use for backend API logic or deployment documentation.
---

# Kabisado Brand & Microcopy Guide

Write student-facing copy that sounds like **Kabi** — a relatable, funny, gently roasting student best friend (*"From huh? to gotcha!"*) — while keeping academic explanations, auth flows, and privacy notices crystal clear.

## When this applies
- Empty states, loading states, and toast notifications (`Toast.jsx`, `UploadLibraryView.jsx`)
- Kabi mascot dialogue and mood captions (`Mascot.jsx`, `Companion.jsx`)
- Quiz score feedback, study streak callouts, and exam countdown prompts
- Reviewing UI text for tone consistency and accessibility

## Tone rules (and why they matter)

1. **Separate playful UI chrome from serious content.**
   - **Playful Taglish allowed:** Empty states, toasts, mascot reactions, streak celebrations, quiz score banners, loading hints. This gives Kabisado warmth and personality so studying feels less lonely.
   - **Plain, clear, zero-joke language required:** Academic explanations, flashcard definitions, quiz answer rationales, login/recovery errors, account deletion warnings, and AI/privacy consent text. Jokes here erode trust or confuse stressed students.

2. **Roast gently, never punch down.**
   - Tease procrastination, cramming, or caffeine habits — never insult intelligence, grades, or effort. Even a low quiz score should end with encouragement and a concrete next step.

3. **Keep microcopy scannable.**
   - Toast messages: 1 short sentence (under ~75 characters).
   - Empty states: 1 witty headline + 1 clear action line.
   - Button labels: Clear action verb first so keyboard and screen-reader users immediately know what happens.

4. **Stay grounded in Kabisado's actual features.**
   - Reference real concepts in the app: modules/handouts, *Mabilisan / Standard / Detalyado* summaries, flashcards, SM-2 due queue, weak-spot quizzes, and Kabi the sleepy owl.

## Output format
When proposing or revising copy, present it in this format:
```markdown
## Copy recommendations

| Surface | Copy | Tone note |
|---|---|---|
| [Component / State] | "[Proposed copy]" | [Playful Taglish / Clear & serious] |
```
If editing code directly, apply the copy in the relevant `.jsx` file and briefly list the updated strings.

## Examples

**Example 1 (Empty state — playful Taglish):**
- Input: Empty document library when a student hasn't uploaded anything yet.
- Output:
  - Headline: `"Wala ka pang module. Bukas na naman?"`
  - Subtext: `"I-upload na ang PDF, DOCX, o notes mo — ako na bahala sa summary at flashcards."`
  - CTA button: `"Mag-upload ng module"`

**Example 2 (Low quiz score — encouraging, not demeaning):**
- Input: Student scored 3/10 on a practice quiz.
- Output: `"3/10 — ayos lang 'yan, warm-up pa lang! Balikan natin ang weak topics mo para solid na sa exam."`

**Example 3 (Auth/recovery warning — serious & unambiguous):**
- Input: Recovery code screen warning.
- Output: `"Save this recovery code now. It is shown only once. Without your password and this code, your account cannot be recovered."`

## Edge cases
- **Mixed English/Tagalog forms:** Match the language already used on that view (e.g., `PrivacyView.jsx` and `AuthView.jsx` stay clear and direct; study views blend light Taglish).
- **Emoji usage:** Use sparingly (at most 1–2 per banner/celebration, e.g. `🦉`, `✨`); omit emojis from form errors and destructive confirmations.

## Reference files
- `references/copy-examples.md`: read when writing sets of quiz score tiers, toast variants, or Kabi mascot mood lines.
