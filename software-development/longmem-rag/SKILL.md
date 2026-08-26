---
name: longmem-rag
description: On-demand FTS5 RAG over ~/longmem markdown, no cap.
version: 0.1.0
author: Hermes
metadata.hermes.tags: [Memory, RAG, FTS5, Retrieval]
---

# LongMem RAG (unlimited agent memory)

Lets the agent keep memory with no 2,200-char cap by storing facts as
markdown files under a git repo and retrieving them on demand with FTS5.

## When to Use
- "remember this forever", "save to longmem", "ingat ini terus".
- Before answering from "past knowledge", if the fact may live in LongMem.
- When the built-in `memory` tool is full (93%+) or a fact is too long for it.

## Prerequisites
- Repo at `/home/saturia/longmem` (git init done). Source of truth = `memory/*.md`.
- Python 3.11 with `sqlite3` FTS5 (verified OK on host). No pip needed.
- Index file `rag.db` is a derived cache; markdown is the real store.

## How to Run
- **Store:** write a markdown file under `memory/` via `write_file`
  (e.g. `/home/saturia/longmem/memory/03-topic.md`), then re-index:
  `python3 /home/saturia/longmem/retrieve.py --index` (via `terminal`, workdir `/home/saturia`).
- **Retrieve (on-demand):** `python3 /home/saturia/longmem/retrieve.py <keywords>` — prints top-k chunks ranked by BM25. Run only when a query is relevant, NOT every session.
- **Commit:** after edits, `cd /home/saturia/longmem && git add -A && git commit -q -m "..."` so the store is versioned/unlimited (git ignores `rag.db` via `.gitignore`).

## Quick Reference
- Index rebuild: `python3 /home/saturia/longmem/retrieve.py --index`
- Search: `python3 /home/saturia/longmem/retrieve.py -k 5 keyword1 keyword2`
- Store dir: `/home/saturia/longmem/memory/`
- Default `workdir` for terminal: `/home/saturia` (terminal runs as `saturia`; `/home/satzz` only visible to file tools).

## Procedure
1. To save: `write_file` a new `memory/NN-topic.md` (NN = next number). Use clear headings + bullets.
2. Re-index: `terminal(command="python3 /home/saturia/longmem/retrieve.py --index", workdir="/home/saturia")`.
3. To recall: `terminal(command="python3 /home/saturia/longmem/retrieve.py <kw>", workdir="/home/saturia")`; read the printed chunk, use it, discard the rest.
4. Commit: `git add -A && git commit -q -m "add <topic>"`.

## Pitfalls
- `rag.db` is stale until you run `--index` after adding/editing a file.
- FTS5 is keyword-based, NOT semantic — phrase the query with the exact words used in the notes.
- Terminal user is `saturia`; never `cd /home/satzz` in terminal (use file tools). Stale-cwd → exit 126; fix with `workdir`, not startup edits.
- Do not abbreviate commands with `...` in chat.

## Verification
Run `python3 /home/saturia/longmem/retrieve.py satzz terminal` and confirm it prints the `# Host / Environment Quirks` chunk with a negative BM25 score.
