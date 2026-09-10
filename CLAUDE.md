# Guardian Kindred Care — Claude Code Guide

## Project Overview

An elderly care web app with two interfaces:
- **Senior** — simplified UI for the elderly person (large text, voice assistant, Hindi/English)
- **Caregiver** — dashboard showing alerts, medicine adherence, and wellbeing of their paired senior

**Stack:** React + TypeScript + Vite + Tailwind + shadcn/ui + Supabase + Clerk auth

---

## Key Files

| File | Purpose |
|---|---|
| `src/lib/voiceAgent.ts` | Voice intent engine — ALL natural language logic lives here |
| `src/components/VoiceAssistantButton.tsx` | Voice UI + intent → action executor |
| `src/context/AppContext.tsx` | Shared state: medicines, wellbeing, alerts, pairing |
| `src/lib/database.ts` | Supabase CRUD wrappers |
| `src/lib/supabase.ts` | Supabase client init |
| `src/hooks/useSpeechRecognition.ts` | Web Speech API wrapper |
| `src/pages/senior/` | Senior-facing pages |
| `src/pages/caregiver/` | Caregiver-facing pages |

---

## Voice Agent Architecture

### Intent Types (`AgentIntent` in `voiceAgent.ts`)

| Intent | Meaning | Key params |
|---|---|---|
| `add_medicine` | Add new medicine to schedule | `name`, `dosage`, `frequency`, `beforeAfterFood` |
| `mark_medicine_taken` | Log a medicine as taken | `medicineName` (or `"all"`) |
| `snooze_medicine` | Remind me later about a medicine | `medicineName`, `snoozeMinutes` (default `"30"`) |
| `log_meal` | Record that a meal was eaten | `mealType` (breakfast/lunch/dinner/snack) |
| `record_wellbeing` | Log mood / pain | `mood` (good/okay/not_well), `painArea` (optional) |
| `check_medicines` | Read out pending medicines | — |
| `check_status` | Full status summary | — |
| `unknown` | Could not parse | — |

### Processing pipeline

```
SpeechRecognition → transcript
  → processVoiceCommand(transcript)
      → callGroq()       [if VITE_GROQ_API_KEY set]
      → callOpenRouter()  [fallback if VITE_OPENROUTER_API_KEY set]
      → localFallback()   [rule-based, always available]
  → AgentAction
  → executeAction() in VoiceAssistantButton
```

**The LLM uses the SYSTEM_PROMPT in `voiceAgent.ts`** — keep it in sync with new intents.
**`localFallback()` is the offline/no-key path** — it must cover all common phrasings.

### Critical ordering in `localFallback()`

1. Wellbeing checks first (pain words are unambiguous)
2. **Snooze BEFORE mark_taken** — "I will take X later" contains "take" which overlaps
3. Mark_taken (explicit signals, then broad fallback)
4. Add medicine
5. Meal logging
6. Check queries
7. `unknown`

---

## Adding a New Intent — Checklist

When adding a new intent (e.g., `skip_medicine`):

- [ ] Add the new string to `AgentIntent` union type
- [ ] Add intent description + example phrases to `SYSTEM_PROMPT` (keeps LLM path working)
- [ ] Add detection patterns to `localFallback()` in the correct position (see ordering above)
- [ ] Add a `case 'new_intent':` handler in `executeAction()` in `VoiceAssistantButton.tsx`
- [ ] Add a hint chip in the help hints section of `VoiceAssistantButton.tsx`
- [ ] Test with MCP tool: `test_voice_command` (see MCP section below)

---

## Voice Pattern Conventions

### English patterns to always cover

For any medicine-related intent, cover these surface forms:
- Explicit: "took/taken/had my medicine/pill/tablet/capsule/dose"
- Informal: "just took", "already took", "finished my"
- Future-snooze: "will take / gonna take / going to take / want to take ... later"
- Implicit: broad fallback catches garbled speech-recognition output

### Hindi patterns to always cover

| Concept | Hindi phrases |
|---|---|
| medicine | dawai, goli, tablet |
| took | kha li, kha liya, le li, le liya, pi li, pi liya |
| later | baad mein, thodi der baad, kuch der baad |
| remind | yaad dilao, yaad dilana |
| not now | abhi nahi, abhi mat |
| will take later | baad mein le loonga/loongi |

### Snooze delay resolution (priority order)

1. Explicit hours: "in 2 hours" / "2 ghante mein" → minutes × 60
2. Explicit minutes: "in 30 minutes"
3. Named meal: "after dinner/khana" → 120 min, "after lunch/breakfast" → 60 min
4. Evening/night: "tonight / raat ko / shaam ko" → 120 min
5. Default: 30 min

### Medicine name extraction

- Strip common stopwords: my, the, it, this, that, all, medicine, pill, tablet, capsule, dawai, goli, just, already
- Dosage regex (strip from name): `\d+\s*(mg|ml|g|mcg|iu)`
- Use the first non-stopword word after the verb as the medicine name
- If no name found → `"all"` for taken, `""` for snooze

---

## Environment Variables

```
VITE_GROQ_API_KEY        # Primary LLM (llama-3.1-8b-instant by default)
VITE_GROQ_MODEL          # Override Groq model
VITE_OPENROUTER_API_KEY  # Fallback LLM
VITE_OPENROUTER_MODEL    # Override OpenRouter model (default: openai/gpt-4o)
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_CLERK_PUBLISHABLE_KEY
```

---

## MCP Tool: `test_voice_command`

An MCP server is included for testing the local fallback without a browser.

**Run the server:** `node mcp/voice-tester.mjs`
**Config:** `.mcp.json` (auto-loaded by Claude Code)

Use this tool to validate any phrase before modifying `localFallback()`:
```
test_voice_command("I will take Omeprazole 20mg later")
→ { intent: "snooze_medicine", medicineName: "omeprazole", snoozeMinutes: "30" }

test_voice_command("maine paracetamol kha li")
→ { intent: "mark_medicine_taken", medicineName: "paracetamol" }
```

Always test both the phrase that was failing AND neighbouring phrases (past/future tense variants, with/without medicine name, Hindi equivalents) to avoid regressions.

---

## Common Mistakes to Avoid

- **Don't** add `snooze` patterns after `mark_taken` — "I will take X later" will be misclassified
- **Don't** extract medicine name with a greedy regex — it picks up dosage units or trailing words
- **Don't** use `.includes()` for multi-word patterns — use regex with `\b` word boundaries
- **Don't** modify `SYSTEM_PROMPT` without also updating `localFallback()` — they must stay in sync
- **Don't** add new intents without a `case` handler in `executeAction()` — they silently no-op

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
