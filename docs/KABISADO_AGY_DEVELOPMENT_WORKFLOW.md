# Kabisado — AGY CLI Development Workflow

> **Purpose:** Coordinate the Kabisado unified web + Android project using AGY CLI, with Claude as the primary implementation model, GPT as the independent reviewer, and Gemini as optional supporting analysis.
>
> **Important:** This file is an instruction document. It does not itself change AGY's active model. AGY must use its documented model-selection commands and verify the active model before claiming a switch occurred.

---

## 1. Project goal

Develop the existing Kabisado project into one unified educational platform consisting of:

1. **Kabisado Web Application** — accessible through desktop, laptop, tablet, and mobile browsers.
2. **Kabisado Android Application** — distributed as a signed, downloadable APK.
3. **Kabisado Public Landing Page** — introduces the product, explains its actual features, and provides the current Android APK download.

The web and Android applications must use the same backend, database, accounts, and learning data. Users should be able to move between platforms and continue studying without creating another account or losing progress.

The Android application must be able to check for new releases and inform users when an updated APK is available.

**Do not add a tagline unless the project owner explicitly requests one.**

## 2. AGY CLI model-selection policy

### 2.1 Required model roles

Use these model roles:

| Role | Preferred model family | Responsibility |
|---|---|---|
| Primary implementer | **Claude** — prefer the strongest available Claude coding/reasoning model; prefer Opus when available, otherwise the strongest Sonnet | Codebase audit, implementation, refactoring, tests, bug fixes, documentation |
| Independent reviewer | **GPT** — prefer the strongest available GPT coding/reasoning model | Architecture review, security review, independent code review, test-plan review |
| Optional specialist | **Gemini 4 Argon** if available; otherwise the strongest available Gemini reasoning model | Additional analysis, alternative approaches, difficult troubleshooting |

Do not assume a particular model ID, display name, or availability. The project owner's model quota screen is not a reliable inventory of exact AGY model identifiers.

### 2.2 Discover the actual model identifiers

At the beginning of the workflow, inspect the installed AGY CLI and available models:

```bash
agy --version
agy models
agy --help
```

Use the exact model names or slugs returned by `agy models`. Do not invent model identifiers.

Create an internal model map for this project:

- `PRIMARY_CLAUDE_MODEL`: strongest available Claude coding/reasoning model.
- `REVIEW_GPT_MODEL`: strongest available GPT coding/reasoning model.
- `OPTIONAL_GEMINI_MODEL`: Gemini 4 Argon if listed; otherwise the strongest available Gemini model.

If a preferred family is not available, report that fact and select a reasonable available fallback only with the owner's approval. Never silently substitute Gemini for Claude or GPT while claiming the requested model was used.

### 2.3 Actually switch models — do not merely describe roles

AGY CLI documents:

- `agy models` to list available models.
- `agy --model "<exact model name>"` to start a session with a selected model.
- `/model` to choose and persist the preferred model.
- `/model <model> <prompt>` to run a single prompt using another model without changing the current default model.

Use these documented mechanisms where supported by the installed AGY version.

**Required behavior:**

1. Check the current AGY version and actual model list.
2. Select the primary Claude model for implementation.
3. Before a GPT review, invoke the GPT model using AGY's supported one-shot model invocation, preferably:
   ```text
   /model <EXACT_GPT_MODEL_NAME> <INDEPENDENT_REVIEW_PROMPT>
   ```
4. Wait for the GPT review result.
5. Return to the primary Claude model for approved implementation or corrections. If the one-shot `/model <model> <prompt>` behavior is supported, it should return to the previous default automatically; verify this in the installed version.
6. Use Gemini only when additional analysis is warranted, through the same supported model-selection mechanism.
7. Verify the model used from AGY's response/session display or other reliable CLI output. Record the exact model name used for each review.

**Do not claim a model switch or independent review unless the model was actually invoked and its response was received.**

If AGY cannot execute a model switch from the current agent turn, do not pretend it can. Print the exact command the owner must run and pause at that handoff. For example:

```bash
agy --model "<EXACT_MODEL_NAME>"
```

Do not use undocumented shell commands, private APIs, hidden configuration fields, or guessed model identifiers to force a switch.

### 2.4 Model efficiency

Do not send every task to every model.

- Claude performs the main implementation.
- GPT reviews significant architecture, security, data integrity, and completed implementation work.
- Gemini is used only for a genuinely useful second opinion or difficult investigation.
- Small typo fixes and routine changes do not need a multi-model review.
- Do not run two models that may edit the same files at the same time.
- Keep one authoritative codebase and one implementation owner.

## 3. Development safety rules

1. **Audit before coding.**
2. Do not modify application code during the initial audit.
3. Present the audit and implementation plan and wait for the owner's explicit approval.
4. Do not rewrite the existing stack without a documented technical reason.
5. Preserve working Kabisado features.
6. Do not remove security controls to make Android integration easier.
7. Do not create separate web and Android user databases.
8. Do not invent features, download links, model IDs, test results, or deployment status.
9. Do not commit secrets, API keys, database credentials, Android signing keys, or keystore passwords.
10. Do not claim offline support unless it is implemented and tested.
11. Do not claim an APK update is automatic unless the update workflow has been tested on a real or suitable Android test device.
12. Before risky or irreversible actions, explain the impact and request approval.
13. Keep changes small, reviewable, and documented.
14. Run relevant tests after changes.
15. Do not move to the next major phase until the current phase's acceptance criteria are met.

## 4. Phase 1 — Project audit (READ-ONLY)

**Primary:** Claude  
**Independent review:** GPT, using the documented AGY model switch  
**Gemini:** Only if an additional perspective is needed

Inspect the existing repository and report:

- Frontend framework, structure, routes, and build commands.
- Backend framework, API structure, and deployment configuration.
- Database schema and migrations.
- Authentication, sessions, cookies/tokens, and authorization.
- Existing document upload and parsing.
- AI integration and offline behavior.
- Existing study features.
- Existing responsive design.
- Existing tests and their current status.
- Current hosting and release process.
- Capacitor or Android configuration, if any.
- Security risks and technical debt.
- Dependencies and compatibility risks.

Do not change application files, database data, dependencies, or deployment configuration during this phase.

### Phase 1 deliverables

1. Current architecture summary.
2. Relevant project structure.
3. Reusable components and services.
4. Gaps against the target requirements.
5. Critical, high, medium, and low risks.
6. Proposed architecture.
7. Recommended implementation order.
8. Test strategy.
9. Model names actually discovered through `agy models`.
10. A clear statement of whether AGY successfully invoked the GPT reviewer.

Then stop and wait for approval.

## 5. Phase 2 — Architecture proposal

**Lead:** GPT for independent architecture assessment  
**Implementation planning:** Claude

Design and evaluate:

- Shared web and Android frontend strategy.
- Capacitor compatibility.
- Shared FastAPI backend and Supabase database.
- Authentication in browsers and Android WebView/native context.
- Secure token/session handling.
- Offline data storage and synchronization.
- Public landing page and hosting.
- APK hosting and release metadata.
- Automatic update checking and installation handoff.
- Optional Capacitor live updates.

Explain trade-offs, migration risks, and backward compatibility. Do not implement until the owner approves the proposal.

## 6. Phase 3 — Unified web and Android application

**Primary implementer:** Claude  
**Reviewer:** GPT

Both platforms should use the same:

- Accounts and user profiles.
- Authentication and authorization rules.
- Uploaded learning materials.
- Summaries.
- Flashcards.
- Quizzes and quiz history.
- Subjects and modules.
- Study progress and history.
- User preferences where appropriate.

Verify cross-platform workflows in both directions. For example, upload a module on the web and confirm it is available in Android; complete a quiz on Android and confirm the result appears on the web.

Do not duplicate the backend or database.

## 7. Phase 4 — Android application

**Primary implementer:** Claude  
**Reviewer:** GPT

Evaluate Capacitor before adopting it. Preserve the existing React application unless a strong reason requires another approach.

Review and implement as approved:

- Stable Android application ID.
- App icon and splash screen.
- Android back navigation.
- File picker and upload.
- Microphone and text-to-speech integrations where needed.
- Secure credential storage.
- Permission minimization.
- Lifecycle and network handling.
- Offline capabilities that can be supported reliably.

Build and test a debug APK before producing a release APK.

## 8. Phase 5 — Public landing page

**Primary implementer:** Claude  
**Reviewer:** GPT

Build a public landing page with:

- Product introduction and clear calls to action.
- Actual Kabisado feature descriptions.
- How-it-works section.
- Real screenshots or accurate previews.
- Web and Android platform information.
- Current APK download section.
- Version, release date, APK size, and minimum Android version when known.
- Installation instructions.
- FAQ.
- Privacy, terms, and support links where real policies/pages exist.

Do not add a tagline unless requested. Do not invent support contacts, legal claims, screenshots, or working download URLs.

## 9. Phase 6 — APK release and update system

**Primary implementer:** Claude  
**Reviewer:** GPT

Create a centralized release metadata source, such as a public JSON file or backend endpoint. Include, as appropriate:

- Version name.
- Android version code.
- APK download URL.
- Release date.
- File size.
- Minimum supported Android version.
- Release notes.
- Mandatory/optional update flag.
- Optional checksum for download integrity verification.

The Android application should:

1. Read its installed version.
2. Retrieve the latest release metadata.
3. Compare numeric version codes.
4. Notify the user when a newer compatible version exists.
5. Display release notes and current/latest versions.
6. Allow optional updates to be deferred.
7. Explain mandatory updates clearly.
8. Download the APK with progress and failure handling.
9. Verify the download where practical.
10. Hand installation to Android's package installer.

Never silently install an APK or bypass Android security prompts.

Every update must use the same application ID and signing key as the installed app, and must increase the version code. Protect the signing key and passwords.

### Distinguish update types

- Web frontend deployment updates the website.
- Bundled Android frontend changes normally require a new APK.
- Compatible backend/API changes can reach both platforms without an APK rebuild.
- Native Android code, plugin, or permission changes generally require a new APK.
- Evaluate live updates separately; do not assume they are automatically safe or suitable.

Test update installation over an older signed build.

## 10. Phase 7 — Responsive design and UX

**Primary implementer:** Claude  
**Reviewer:** GPT

Test the public landing page and all major learning features on:

- 320 × 568
- 375 × 667
- 390 × 844
- 430 × 932
- 768 × 1024
- 1024 × 768
- 1366 × 768
- 1920 × 1080

Check navigation, document viewing, upload, summaries, flashcards, quizzes, Ask Kabisado, progress, settings, admin views, and update dialogs.

Preserve Kabisado's warm visual identity and existing palette:

- Mist: `#E4E0E1`
- Sand: `#D6C0B3`
- Mocha: `#AB886D`
- Cocoa: `#493628`

Avoid unnecessary redesigns, excessive gradients, shadows, and decorative animation.

## 11. Phase 8 — Security and quality assurance

**Independent reviewer:** GPT  
**Fixes and tests:** Claude

Review:

- Authentication and authorization.
- Password hashing.
- Session/token storage and refresh behavior.
- CSRF and XSS risks.
- API access control.
- File upload validation and limits.
- SQL injection.
- Rate limiting.
- Sensitive data exposure.
- Android permissions and credential storage.
- APK signing and update integrity.
- Offline synchronization conflicts.
- Backward compatibility.

Run relevant automated tests and manual acceptance tests. Report what was actually tested, what passed, what failed, and what remains unverified.

## 12. Phase 9 — Release and documentation

**Primary:** Claude  
**Final independent review:** GPT

Prepare and document:

- Production web deployment.
- Public landing page deployment.
- Android signed release APK.
- APK hosting.
- Release metadata update procedure.
- Versioning and signing procedure.
- Update checker behavior.
- Installation instructions.
- Rollback/recovery considerations.
- Test report.
- Known limitations.

Do not report production readiness until the relevant release and test checks pass.

## 13. Required status report after each phase

Use this format:

```text
PHASE:
STATUS:

PRIMARY MODEL:
EXACT MODEL NAME:
REVIEW MODEL:
EXACT REVIEW MODEL NAME:

FILES INSPECTED:
FILES CHANGED:

IMPLEMENTED:
TESTS RUN:
TEST RESULTS:

GPT REVIEW:
- Findings:
- Severity:
- Resolutions:

GEMINI REVIEW (if used):
- Findings:

REMAINING ISSUES:
RISKS:
OWNER APPROVAL REQUIRED:
NEXT STEP:
```

Never fill in model names or review results unless they are verified.

## 14. Start here

Begin with **Phase 1: Project Audit (READ-ONLY)**.

First run or inspect the equivalent of:

```bash
agy --version
agy models
```

Identify the exact available Claude, GPT, and Gemini model names. Select Claude as the primary implementation model for the project workflow and use AGY's documented model-switching mechanism to invoke GPT for an independent review of the audit and proposed architecture.

If the current session cannot switch models, give the owner the exact command to run and pause at that handoff. Do not falsely claim that a different model reviewed anything.

Inspect the repository without changing application code. Present the audit and plan, then wait for explicit approval.

---

## Official AGY CLI references

Use the documentation matching the installed AGY version:

- CLI command reference: https://antigravity.google/docs/cli/reference/
- Using AGY CLI: https://antigravity.google/docs/cli/using
- Official hands-on codelab: https://codelabs.developers.google.cn/antigravity-cli-hands-on

The installed CLI's `agy --help` and `agy models` output take precedence over guessed commands or model identifiers.
