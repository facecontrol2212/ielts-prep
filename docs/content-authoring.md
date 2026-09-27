# Content authoring

How a test gets into the system.

A test is a **JSON file in `content/`**, version-controlled next to the code. There is no
"authoring UI" that bypasses this: the admin panel posts the same document to
`POST /api/admin/tests/import`, which calls the same validator and the same importer as the
CLI. If `python -m app.cli validate` rejects your file, the admin panel will too.

**Legal:** every passage, transcript, prompt and model answer in `content/` must be
originally authored or openly licensed. Cambridge and British Council materials are
copyrighted — do not paste them, do not paraphrase them closely.

---

## 1. Workflow

```bash
cd api

# 1. write / edit content/reading/academic-02.json

# 2. check it without touching the database
uv run python -m app.cli validate ../content/reading/academic-02.json

# 3. import it
uv run python -m app.cli import ../content/reading/academic-02.json

# 4. or import everything at once (safe to re-run)
uv run python -m app.cli import-dir ../content/

# speaking bank and band tables
uv run python -m app.cli seed-speaking ../content/speaking/questions.json
uv run python -m app.cli seed-bands
```

Exit code is `0` when everything imported and `1` if anything failed; failures are listed at
the end with the offending file and one line per problem.

### Re-import semantics

| Thing | On re-import of the same `slug` |
|---|---|
| `tests` row | **kept, same id** — links and catalogue entries survive |
| `sections`, `question_groups`, `questions`, `answer_keys` | **deleted and recreated** — new ids every time |
| `is_published` | **kept**, unless the document sets `is_published` explicitly |
| A test with submitted/scored attempts | **refused** unless `--force` |

Question ids change on every re-import. That is deliberate: it keeps the importer simple and
correct, at the cost of making "edit a live test mid-exam" unsupported. With `--force`, saved
`attempt_answers` pointing at the replaced questions are deleted and the summary says how many.

Everything a single file does happens in **one transaction**: rows are built and flushed, and
the session is committed once, at the very end. Nothing is committed before the last answer key
is in place, so a document either lands completely or not at all. The importer never calls
`rollback` itself — the caller owns the session and rolls it back on failure (the CLI, the admin
endpoint and `import_directory` all do). A refusal over scored attempts is raised *before* a
single row is touched, including for a writing prompt set, where the whole set is checked before
the first prompt is written.

---

## 2. Document kinds

Every file starts with a `kind` discriminator:

| `kind` | Contains | Imports as |
|---|---|---|
| `test` | one reading / listening / writing test | one `tests` row + sections + questions + answer keys |
| `speaking_bank` | the Part 1/2/3 question bank | `speaking_questions` rows (upsert keyed on question text) |
| `writing_prompts` | a set of independent writing prompts | one zero-question `tests` row per prompt |

Unknown keys anywhere are a hard error — a typo in a field name is a content bug, not a
comment.

---

## 3. `kind: "test"` — field by field

### Top level

| Field | Type | Req | Notes |
|---|---|---|---|
| `kind` | `"test"` | yes | |
| `slug` | string | yes | lowercase-with-hyphens, unique, the stable identity of the test |
| `skill` | `listening` \| `reading` \| `writing` \| `speaking` | yes | |
| `variant` | `academic` \| `general` | no | default `academic` |
| `title` | string | yes | shown on the catalogue card |
| `description` | string | no | |
| `difficulty` | 1–5 | no | default 3 |
| `duration_seconds` | int > 0 | yes-ish | default 3600. Reading 3600, Listening 1800, Writing 3600 |
| `transfer_seconds` | int ≥ 0 | no | listening answer-transfer time, default 0 (use 120) |
| `question_count` | 0–40 | yes | **must equal the real number of questions** |
| `is_published` | bool | no | omit to keep whatever the database already has |
| `source` | string | no | provenance, e.g. `"original – authored in-house"` |
| `sections` | list | yes | ≥ 1 |

### Section

| Field | Type | Notes |
|---|---|---|
| `order` | 1–9 | unique within the test; sections import in this order |
| `title` | string | e.g. `"Passage 1 — The quiet engineering of the honeybee"` |
| `instructions` | string | shown above the section |
| `passage_html` | HTML | **required for reading** |
| `audio_url` | string | **required for listening**, e.g. `/media/listening/test-01/section-1.mp3` |
| `transcript` | string | **required for listening** — the answer-review screen is built on it |
| `prompt_html` | HTML | **required for writing** |
| `image_url` | string | optional chart/map image |
| `image_description` | string | **required whenever `image_url` is set on a writing section.** What the chart actually shows, in words. The AI grader never sees the picture and a screen reader has nothing else to read out |
| `min_words` | int | writing only (150 / 250) |
| `start_question`, `end_question` | int | optional; derived from the questions if omitted, and checked against them if given |
| `groups` | list | question groups; empty for writing |

### Question group

A group is a run of consecutive questions sharing one set of instructions, one word limit and
one option pool — exactly what a real paper prints as *"Questions 14–18"*.

| Field | Type | Notes |
|---|---|---|
| `order` | int ≥ 1 | unique within the section |
| `type` | question type | see the table below; a question may override it |
| `instructions` | string | the rubric, verbatim as the student sees it |
| `word_limit` | 1–10 | **required whenever the instructions contain "NO MORE THAN"** |
| `allow_number` | bool | true for *"AND/OR A NUMBER"* |
| `options` | `[{label, text}]` | the shared pool: headings, features, sentence endings, MCQ choices |
| `select_count` | int ≥ 2 | `multiple_choice_multi` only: how many labels to pick |
| `content_html` | HTML | the summary paragraph / note skeleton / table the gaps sit in; write gaps as `___17___` |
| `image_url` | string | map or diagram |
| `questions` | list | ≥ 1 |

### Question

| Field | Type | Notes |
|---|---|---|
| `number` | 1–40 | unique across the whole test, contiguous from 1, increasing in document order |
| `type` | question type | optional override of the group type |
| `prompt` | string | the statement / stem / gap sentence |
| `options` | `[{label, text}]` | per-question override of the pool (normal for multiple choice) |
| `word_limit` | 1–10 | per-question override |
| `allow_number` | bool | per-question override |
| `evidence` | string | **the exact sentence from the passage/transcript that proves the answer**, shown in review |
| `audio_timestamp` | int (seconds) | **required for listening**; where the answer is spoken |
| `answer` | object | the answer key, below |

### Answer key

| Field | Type | Notes |
|---|---|---|
| `accepted` | `[string]` | ≥ 1 non-blank entry. Every acceptable form: `["colour","color"]`, `["A"]`, `["B","D"]` |
| `match_mode` | `normalised` \| `exact` \| `option` \| `option_set` | omit and it is inferred from the type |
| `allow_optional_article` | bool | default `true`: `"the museum"` accepted for `"museum"` |
| `explanation` | string | why this is the answer; shown in review. Always write one |

### Question types and their answer shape

| `type` | Answer | Default `match_mode` |
|---|---|---|
| `multiple_choice` | one option label | `option` |
| `multiple_choice_multi` | `select_count` labels | `option_set` |
| `true_false_not_given` | `TRUE` / `FALSE` / `NOT GIVEN` | `option` |
| `yes_no_not_given` | `YES` / `NO` / `NOT GIVEN` | `option` |
| `matching_headings` | one heading label (`i`, `ii`, …) | `option` |
| `matching_information` | one paragraph label (`A`, `B`, …) | `option` |
| `matching_features` | one feature label | `option` |
| `matching_sentence_endings` | one ending label | `option` |
| `sentence_completion` | free text | `normalised` |
| `summary_completion` | free text (or a label, if a word bank is supplied) | `normalised` |
| `note_completion`, `table_completion`, `flow_chart_completion`, `form_completion` | free text | `normalised` |
| `diagram_labelling`, `map_labelling` | free text or a label | `normalised` |
| `short_answer` | free text | `normalised` |

`true_false_not_given` and `yes_no_not_given` get their option pool for free — you may omit
`options` and the importer materialises `TRUE/FALSE/NOT GIVEN` (or `YES/NO/NOT GIVEN`).

---

## 4. Validation rules

These are enforced by `app/schemas/content.py`, so the CLI and the admin endpoint behave
identically. **Every message names the offending question number.**

**Numbering**
1. Question numbers are unique across the whole test — `Q17: question number 17 is used more than once in this test`.
2. Question numbers are contiguous from 1 with no gaps — `Q23: question number 23 is missing — numbers must run 1..40 with no gaps`.
3. No number may exceed the test's question count.
4. Numbers must increase in document order (section order, then group order, then question order).
5. `question_count` must equal the number of questions actually defined.
6. `start_question` / `end_question`, when given, must match the first/last question of the section.
7. Section `order` values are unique; group `order` values are unique within a section.

**Answer keys**
8. Every question has at least one non-blank accepted answer.
9. Single-option types (`multiple_choice`, TFNG, YNNG, all `matching_*`) accept exactly one label.
10. Every accepted label of an option-type question must exist in the pool that applies to it (the question's own `options`, else the group's, else the TFNG/YNNG default) — `Q8: accepted answer 'F' is not in the option pool (A, B, C, D, E)`.
11. `multiple_choice_multi` requires `select_count` on the group, and the key must list exactly that many distinct labels.
12. `match_mode` must be consistent with the question type: option types require `option`, `multiple_choice_multi` requires `option_set`, text types allow `normalised` or `exact`.
13. A `word_limit` on an option-type question is an error — the answer is a label, not prose.
14. Every accepted answer of a text question must fit its own word limit. An answer that is over the limit could never be marked correct, so it is an authoring bug, not a generous alternative.

**Instructions**
15. If a group's `instructions` contain `NO MORE THAN`, a `word_limit` must be set on the group or on every question in it.

**Skill-specific**
16. Reading: every section has `passage_html`.
17. Listening: every section has `audio_url` **and** `transcript`, and every question has an `audio_timestamp`.
18. Writing: every section has `prompt_html` and defines no questions.

**Other**
19. `slug` is lowercase-with-hyphens.
20. Speaking: Part 2 needs ≥ 3 `cue_points` and a model answer of ≥ 100 words; Parts 1 and 3 must not have cue points; every Part 3 topic must also exist as a Part 2 topic; no duplicate question text.
21. Writing prompts: Task 1 requires a `visual_description` of at least 30 words, Task 2 must not have one; `min_words` is 150 for Task 1 and 250 for Task 2; prompt slugs are unique within the file.
22. A writing section that sets `image_url` must also set `image_description`.

### Soft check: evidence quotes

`evidence` should be a **verbatim** quote from the section's passage or transcript. This is
not a hard validation error (an author may legitimately paraphrase), but it *is* reported as
a warning by `validate` and by the importer, and `tests/test_importer.py` asserts that every
shipped file in `content/` is warning-free. A citation the student cannot find in the text is
worse than no citation.

---

## 5. `kind: "speaking_bank"`

```json
{
  "kind": "speaking_bank",
  "title": "Speaking question bank 1",
  "questions": [
    {
      "part": "part_1",
      "topic": "Hometown",
      "question": "Where is your hometown?",
      "model_answer": "...",
      "useful_phrases": [{"phrase": "on the outskirts of", "note": "just outside a city"}],
      "band_target": 7.5
    },
    {
      "part": "part_2",
      "topic": "A skill you learned",
      "question": "Describe a practical skill you learned as an adult.",
      "cue_points": ["what the skill is", "how you learned it", "how long it took",
                     "and explain why it matters to you"],
      "model_answer": "... at least 100 words, a real two-minute turn ...",
      "useful_phrases": [{"phrase": "it took a fair bit of trial and error"}]
    }
  ]
}
```

Import is an **upsert keyed on the question text**: editing a model answer and re-seeding
updates the row in place. `--prune` deletes bank rows the file no longer contains.

## 6. `kind: "writing_prompts"`

```json
{
  "kind": "writing_prompts",
  "variant": "academic",
  "prompts": [
    {
      "slug": "writing-t1-household-energy",
      "task_number": 1,
      "title": "Household energy use by source",
      "topic": "Energy",
      "prompt_html": "<p>The chart below shows ... Summarise the information ...</p>",
      "visual_description": "A bar chart with four bars ... (the AI grader reads this)",
      "min_words": 150
    }
  ]
}
```

The set may also carry `"is_published": true`, which is applied to every prompt in it.

Each prompt imports as its own `tests` row (`skill=writing`, `question_count=0`) with a single
section carrying `prompt_html` and `min_words`. Task 1 defaults to 20 minutes, Task 2 to 40.

Because v1 has no chart images, `visual_description` is what the student and the AI grader both
read. It is written into the section twice: appended to `prompt_html` so the student always sees
it, and stored on its own in **`Section.image_description`**, which is the field the AI writing
grader and screen readers consume. Write it as a complete, unambiguous description of the
figures — chart type, axes and units, every category and series, the actual values, the period.
A student must be able to write a real Task 1 answer from it alone. Validation requires at least
30 words for a Task 1 prompt; the shipped ones run to 180-220.

---

## 7. Worked example

A four-question reading section with three question types:

```json
{
  "kind": "test",
  "slug": "reading-demo-01",
  "skill": "reading",
  "variant": "academic",
  "title": "Demo Reading Test",
  "duration_seconds": 3600,
  "question_count": 4,
  "is_published": true,
  "source": "original – authored in-house",
  "sections": [
    {
      "order": 1,
      "title": "Passage 1",
      "instructions": "You should spend about 20 minutes on Questions 1-4.",
      "passage_html": "<p>Seagrass meadows store carbon far faster than forests do. ...</p>",
      "start_question": 1,
      "end_question": 4,
      "groups": [
        {
          "order": 1,
          "type": "true_false_not_given",
          "instructions": "Do the following statements agree with the information in the passage? Write TRUE, FALSE or NOT GIVEN.",
          "questions": [
            {
              "number": 1,
              "prompt": "Seagrass stores carbon more quickly than woodland.",
              "evidence": "Seagrass meadows store carbon far faster than forests do.",
              "answer": {"accepted": ["TRUE"], "explanation": "'far faster than forests' states this directly."}
            }
          ]
        },
        {
          "order": 2,
          "type": "sentence_completion",
          "instructions": "Complete the sentences below. Choose NO MORE THAN TWO WORDS from the passage for each answer.",
          "word_limit": 2,
          "questions": [
            {
              "number": 2,
              "prompt": "The meadows are damaged mainly by ___.",
              "evidence": "...",
              "answer": {"accepted": ["coastal dredging", "dredging"], "explanation": "..."}
            }
          ]
        }
      ]
    }
  ]
}
```

---

## 8. Shipped content

| File | What |
|---|---|
| `content/reading/academic-01.json` | Academic Reading, 3 original passages, 40 questions, 8 question types |
| `content/listening/test-01.json` | Listening, 4 sections, 40 questions, full original transcripts |
| `content/writing/prompts-01.json` | 10 prompts: 5 Academic Task 1, 5 Task 2 |
| `content/speaking/questions.json` | 40 questions: 20 Part 1, 8 Part 2 cue cards, 12 Part 3 |

All of it is original material authored for this project.

## 9. What an import prints

```
  ok   ../content/reading/academic-01.json
         created  reading-academic-01  [reading]  3 section(s), 10 group(s), 40 question(s), 40 key(s)
  ok   ../content/speaking/questions.json
         created  speaking-bank  40 item(s) (40 new, 0 updated)
```

A ` warn ` line is an evidence quote that could not be found verbatim in the passage or
transcript, or a note that saved student answers were deleted by a `--force` re-import. A
` FAIL ` line is followed by one indented line per validation problem, each naming the question
number.
