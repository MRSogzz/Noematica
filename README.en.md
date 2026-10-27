<div align="center">

# Noematica

### A knowledge base that doesn't just store content — it answers *why*

**An open-source, Git-native epistemic knowledge kernel that turns scattered notes into a structured, reasoning-capable, traceable knowledge graph. LLM provider not locked in: cloud or local. Fully local execution costs $0.**

[![Python 3](https://img.shields.io/badge/python-3-blue.svg)](https://www.python.org/downloads/)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-yellow.svg)](LICENSE)
[![Git-native](https://img.shields.io/badge/Git-native-black.svg)](#core-concepts)
[![LLM-agnostic](https://img.shields.io/badge/LLM-agnostic-green.svg)](#architecture)

**English** · [繁體中文](README.md)

[Quickstart](#quickstart) · [Core Concepts](#core-concepts) · [Features](#features) · [Architecture](#architecture) · [API](#api) · [Known Limitations](#known-limitations) · [FAQ](#faq)

</div>

---

Noematica is not a typical note-taking app. It is an **epistemic knowledge infrastructure**: a system built on the belief that knowledge should be organized as *entities, relations, observations, and sources* — not as loose pages and blocks.

- **Knowledge is organized as a four-layer structure** (Entity — Atom — Observation — Source), not as free-floating pages.
- **Relations (Atoms) are never overwritten, only state-changed.** Observations are append-only. Every reasoning chain is traceable.
- **LLMs extract and organize; humans review and approve.** A draft queue and a compile step sit between the two.
- **Git is the single source of truth.** Every change to every epistemic unit is diffable, attributable, and collaborative.

If you want a knowledge base that can *explain why*, *show its evidence*, and *evolve over time* — rather than yet another static wiki — Noematica is built for that.

---

## Quickstart

### Prerequisites

- Git
- Node.js / TypeScript (for the `application/` layer)
- Python 3 (for the `epistemic/` + `runtime/` layers)
- Optional: Anthropic / OpenAI API key, or a local `llama-server` (for note extraction and correlation)

### Install

```bash
git clone https://github.com/MRSogzz/Noematica.git
cd Noematica
pip install -r requirements.txt
# Install Node dependencies inside application/ via its package.json
```

### Run

```bash
# Start the Python epistemic service (FastAPI, default 127.0.0.1:8765)
python3 integration/epistemic_adapter/http_server.py

# Start the Node backend and frontend (see application/ for the exact command)
# e.g.:
# cd application && npm install && npm run dev
```

Once the HUD is open, press **M** for the cognitive map (Activation Orbit) and **H** for the AI knowledge organizer.

---

## Core Concepts

### The Knowledge Graph (Entity‑Atom‑Observation‑Source)

Noematica's knowledge is made of four card types:

| Layer | Role | Key fields | Behavior |
|---|---|---|---|
| **Entity** | Entity card | uid / name / type / domains / aliases | Referenced by many Atoms |
| **Atom** | Relation skeleton | from → to / type / abstraction / status / lifecycle / lineage | **Never overwritten — state changes only** |
| **Observation** | Observation record | atom / epoch / 5-axis context / impact / probability / stance / confidence / evidence | **Append-only** |
| **Source** | Evidence anchor | title / source_fingerprint / published_date | Root of evidence |

All cards are stored as **Markdown + frontmatter** under the corresponding `epistemic/` directories, with full version history in Git.

### Four Layers and the Bridge

The system is split into four layers that communicate only through `integration/`:

- `application/` — Web UI and API service (Node/TS)
- `knowledge/` — Human-readable documents (`docs/`) and AI-generated drafts (`wiki/`)
- `epistemic/` — Epistemic core: Entity / Atom / Observation / Source
- `runtime/` — Reasoning and automation services (indexer, activation, policy, compiler, reasoning, extraction, correlation)
- `integration/` — Bridge layer (`epistemic_adapter` HTTP service + contract definitions)

`application/` (Node/TS) and `epistemic/` + `runtime/` (Python) are independent and integrate via HTTP.

---

## Features

### Cognitive Map — Activation Orbit (press M)

A **multi-hop neighborhood query** anchored on a focal entity:

- **Search** by name / alias / uid / domain / type across Entities and Atoms.
- **Activation Queue (left panel):** computes a **Path Confidence** for each reachable entity (weakest link on the path × per-hop decay), bucketed into **Strong / Medium / Weak / Hidden**.
- **Orbit (concentric center):** Layer 0 / 1 / 2 / 3… expanded outward. The layer cap is controlled by `activation_queue.max_layer` in `runtime/policy/policy.yaml` (default: 4).
- **Explain panel:** aggregates evidence (support / contradiction / baseline) from the related Atoms.
- **Reasoning Path panel:** shows the shortest path from the search origin to the current focal entity (narrative chain).
- **Timeline panel:** grouped observations by epoch.

### AI Knowledge Organizer (press H)

Reads human notes from `knowledge/docs/`, runs them through an LLM into structured summaries, and writes them to `knowledge/wiki/`. Supports four providers: **Anthropic, OpenAI, Llama (local), and custom endpoints**.

### Note Extraction (side panel in M)

Free text is sent through an LLM to extract candidate Entity / Atom / Observation cards, with automatic uid reuse against existing Entities. Drafts are written to `epistemic/0_Inbox/` and require human review before compiling into the formal layer.

### Draft Review Loop

- List all drafts in `0_Inbox/`.
- Approve (sets `approved: true`) or reject (records a reason and moves the draft into `6_Rejected/` as an anti-pattern memory).
- Compile: invokes the Compiler to validate format and write into the corresponding formal directory. On success, the draft disappears from `0_Inbox/`.

### Cross-Note Correlation (CLI / API)

Measures the relatedness of two notes across three dimensions: **entity overlap (Jaccard)**, **cognitive-graph distance (shortest Atom path)**, and **stance relationship (LLM-judged: reinforce / complementary / contradict / neutral)**. Above a threshold, a proposal is generated.

### Indexing and Governance

- **Index Builder:** scans the four layers and produces TSV indexes plus a knowledge-debt report in `.index/`.
- **Governance Auditor:** offline scan of the whole graph, producing arbitration, lifecycle-review, and revival proposals into `0_Inbox/`.
- **Policy Engine:** centralizes confidence decay, abstention thresholds, arbitration triggers, and lifecycle rules (`runtime/policy/policy.yaml`).

---

## Architecture

### Services

- **Python epistemic service:** `integration/epistemic_adapter/http_server.py` (FastAPI), listening on `127.0.0.1:8765`.
- **Node backend:** `application/backend/server.ts`, proxying all `/api/epistemic/*` requests to the Python service.
- **Formal contracts:** `integration/contracts/*.schema.json` (Query, Belief, Feedback) keep the two sides' data shapes aligned.

### HUD Panels at a Glance

| Feature | HUD key | CLI | HTTP | Data location |
|---|---|---|---|---|
| Personal journal | F1 | `wiki note` | `/api/notes` | `application/.system/user/notes/` |
| Collaboration lobby | F2 | `wiki git` | `/api/git/*` | `.git` |
| Cognitive map | **M** | — | `/api/epistemic/orbit/:uid` etc. | `epistemic/` (4 layers) |
| AI organizer | **H** | — | `/api/ai/*` | `knowledge/wiki/` |
| Note extraction | M side panel | `wiki epistemic extract` | `/api/epistemic/extract` | `epistemic/0_Inbox/` |
| Cross-note correlation | — | `wiki epistemic correlate` | `/api/epistemic/correlate` | `epistemic/0_Inbox/` |
| Draft review | M side panel | `wiki epistemic inbox list\|approve\|reject\|compile` | `/api/epistemic/inbox*`, `/compile` | `epistemic/0_Inbox/` → formal layers |
| Governance summary | M top bar | — | `/api/epistemic/governance-summary` | all four epistemic layers |
| Rebuild index | — | `python3 runtime/indexer/index_builder.py` | — | `.index/` |
| Governance audit | — | `python3 runtime/policy/governance_auditor.py` | — | `0_Inbox/` |
| Compile drafts | M "Review" modal | `wiki epistemic inbox compile` | `POST /api/epistemic/compile` | Formal four layers |

---

## API

Endpoints exposed by the Node proxy:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/epistemic/health` | Check Python connectivity |
| `POST` | `/api/epistemic/query` | Single-Atom epistemic query (returns a Belief Contract) |
| `POST` | `/api/epistemic/feedback` | Record query history |
| `GET` | `/api/epistemic/graph` | Full Entity‑Atom graph (for the legacy 3D map; deprecated) |
| `POST` | `/api/epistemic/extract` | Note extraction (requires an LLM config) |
| `POST` | `/api/epistemic/correlate` | Cross-note correlation |
| `POST` | `/api/epistemic/inbox/list` / `approve` / `reject` / `compile` | Draft review operations |
| `GET` | `/api/epistemic/domains` | List all domains (used for Orbit search filters) |
| `GET` | `/api/epistemic/search` | Search by name / alias / uid / domain / type |
| `GET` | `/api/epistemic/orbit/:uid` | **Orbit core data:** layered expansion + Activation Queue (multi-hop Path Confidence) |
| `GET` | `/api/epistemic/explain/:uid` | Evidence summary for related Atoms |
| `GET` | `/api/epistemic/reasoning-path?from=&to=` | Shortest path between two entities (narrative chain) |
| `GET` | `/api/epistemic/timeline/:uid` | Related observations grouped by epoch |
| `GET` | `/api/epistemic/governance-summary` | Governance digest |

---

## Repository Layout

```
my-knowledge-repo/
├── application/              # Node/TS project (backend, CLI, frontend)
│   ├── backend/server.ts     # API service + epistemic proxy
│   ├── cli/wiki.ts           # CLI entry point
│   ├── frontend/             # HUD (entry: hud-main.html)
│   ├── modules/              # I/O periodic-table modules
│   ├── milestones/           # F4 milestones
│   └── .system/              # Caches and personal notes
├── knowledge/
│   ├── docs/                 # Human-readable documents (F5)
│   └── wiki/                 # AI-organized drafts
├── epistemic/                # Epistemic core (0_Inbox … 9_Blind_Spots + .index/)
├── runtime/                  # indexer / activation / policy / compiler / reasoning / extraction / correlation
├── integration/
│   ├── epistemic_adapter/    # HTTP service (FastAPI) + adapter
│   ├── wiki_adapter/         # Python-side call examples
│   └── contracts/            # JSON Schema contracts
├── pre-commit.sample         # Sample Git hook
└── requirements.txt          # Python dependencies
```

---

## Known Limitations

- **Note extraction and correlation require an LLM** (Anthropic / OpenAI / local llama). With local llama you must run `llama-server` yourself and keep the endpoint consistent.
- **`wiki map` (a CLI for browsing the docs tree) and the HUD's M key are different features** — this is intentional.
- **Draft approval and compilation are two separate steps** to prevent accidental writes into the formal layer before proper validation.

---

## FAQ

<details>
<summary><b>How is Noematica different from Obsidian, Logseq, or Notion?</b></summary>

Those tools treat **pages or blocks** as the unit of knowledge, with links as decoration. Noematica treats **relations (Atoms) and observations (Observations)** as first-class, with pages as their carriers.

Three differences:

- **Relations are first-class and immutable.** An Atom states that some relation exists between A and B, and can only change its `status` / `lifecycle` — never its history. Backlinks have no such constraint.
- **Every claim is traceable to evidence.** Observations bind to Sources and carry confidence, stance, impact, and other axes. Ordinary note links carry no evidence chain.
- **Extract → review → compile is mandatory.** Knowledge enters the formal layer through a draft queue, not by being written directly into a page.

If you just want to jot things down, use Obsidian. If you want *why* a piece of knowledge holds, what evidence backs it, and how it has evolved — that is Noematica's territory.
</details>

<details>
<summary><b>Can I use Noematica without an LLM?</b></summary>

Yes, but with greatly reduced functionality.

The core — the knowledge graph, the four-layer Atom / Observation / Source model, Git-based versioning, Orbit neighborhood queries, governance audit, and draft review / compile — works **without any LLM**. You can hand-author every card.

An LLM is needed for three things: **note extraction** (free text → candidate cards), **AI organizer** (docs → wiki summaries), and **cross-note correlation** (stance judgment).

Put another way: **the LLM is an accelerator, not the foundation.** Without it you fill in cards manually. With it, you drop in handwritten notes and let it draft; you still review.
</details>

<details>
<summary><b>Which LLMs are supported? Can it run fully locally?</b></summary>

Four providers: **Anthropic, OpenAI, Llama (local llama-server), and custom endpoints**. Together these cover the vast majority of mainstream services — any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, OpenRouter, many cloud models) can be plugged in via the "custom endpoint" slot.

Fully local is viable: run an open model on a local `llama-server` and everything — extraction, organization, correlation — happens on your machine. No data leaves the host, and cost is zero. You do need to start `llama-server` yourself and point the config at it.

Cloud and local can be mixed — for example, a small local model for extraction, a larger cloud model for stance judgment in correlation.
</details>

<details>
<summary><b>Why can't Atoms be edited — only state-changed?</b></summary>

Because **history itself is knowledge**.

If an "A causes B" relation could be silently rewritten into "A and B are unrelated," you would lose the trace of *why it was once believed* and *why it was later overturned*. Noematica keeps the Atom's skeleton fixed while letting you change its `status` (e.g. active / retracted) and `lifecycle`, and records the current view as a new Observation. Old observations never disappear — the old and the new coexist, and the reasoning chain stays traceable.

The cost: you cannot "delete a relation and pretend it never existed." You can only mark it retracted. This is a deliberate trade-off.
</details>

<details>
<summary><b>Why is human review mandatory? Why not auto-write everything?</b></summary>

You could auto-write, but Noematica deliberately doesn't.

LLM-extracted Entity / Atom / Observation cards land first in the `epistemic/0_Inbox/` draft queue and must be **manually approved and compiled** before entering the formal layer. The reason is simple: LLMs err — and err confidently. Writing straight into the formal knowledge layer would contaminate the graph, and the graph is used for reasoning — a contaminated reasoning chain is more dangerous than no chain at all.

The design separates **extraction** from **acceptance**: machines contribute breadth, humans gate trust.
</details>

<details>
<summary><b>Why Git instead of a database?</b></summary>

Because Noematica wants **traceable, diffable, collaborative knowledge history** — and Git was built for exactly that.

All epistemic units are Markdown + frontmatter on the filesystem, with full Git history. You can see, for any relation, what its confidence was three months ago, who changed it, when, and on what evidence. A database could do this too, but you would have to build the versioning layer yourself. Git gives it to you for free, and its ecosystem (branches, PRs, code review workflows) drops in directly.

The cost: query performance is weaker than a database, and scale requires an extra indexing layer — which is why `runtime/indexer` produces TSV indexes and a knowledge-debt report.
</details>

<details>
<summary><b>Where is data stored? Can I back it up or move it?</b></summary>

All inside your repo:

```text
epistemic/          # Four-layer cards (Markdown + frontmatter)
knowledge/docs/     # Human-readable documents
knowledge/wiki/     # AI-organized drafts
.index/             # Indexes and reports (rebuildable)
application/.system/user/notes/   # Personal journal
```

No hidden cloud database. Backup is `git push` or copying the directory; migration is a clone on another machine. `.index/` is derived — delete it and it rebuilds.
</details>

<details>
<summary><b>How is Path Confidence computed?</b></summary>

Walk the knowledge graph outward from the focal entity. Each reachable entity gets a score given by: **the weakest link on the path × a per-hop decay of 0.9**.

In other words, a chain's overall confidence never exceeds its weakest link (barrel principle), and every extra hop multiplies by 0.9 — the farther you go, the more it decays. Scores are bucketed into **Strong / Medium / Weak / Hidden** and shown in the Activation Queue. The layer cap (default 4) is set by `activation_queue.max_layer` in `runtime/policy/policy.yaml` and is configurable.
</details>

<details>
<summary><b>Is there a web UI? What is the HUD?</b></summary>

Yes — the HUD is a **browser-based local interface**. The frontend is `application/frontend/hud-main.html`, served by the Node backend and opened on `localhost` by default.

It exposes keyboard-driven panels: F1 personal journal, F2 collaboration lobby, **M** cognitive map (Activation Orbit), **H** AI knowledge organizer.

Although it is local-first by default, because it is just a web interface, **it can also be deployed to a server** for others to access. Note that Noematica does not ship multi-user authentication or storage isolation — you would have to add those to run it as a shared service.
</details>

<details>
<summary><b>Can I import existing Markdown / Obsidian notes?</b></summary>

**Plain Markdown: yes. Obsidian-specific syntax: no.**

Any standard Markdown file dropped into `knowledge/docs/` is treated as a human-readable document and can go through the **H-key AI organizer** to produce a wiki summary, or through **note extraction** to become candidate Entity / Atom / Observation cards. Because Noematica itself is Markdown + frontmatter, the format is a natural fit.

**Obsidian-specific syntax is not supported:**

- `[[wikilink]]` backlinks are not parsed into Entity relations — Noematica's relations are explicit Atom cards, not implicit links.
- Obsidian's frontmatter conventions, `dataview` queries, callouts (`> [!note]`), `.obsidian/` settings, and plugins are ignored.
- There is no built-in one-shot converter from an Obsidian vault to the four-layer card model.

The practical migration path: drop `.md` files into `knowledge/docs/` → let the LLM extract candidate cards → review them manually → compile into the formal layer. To turn `[[wikilink]]` into Atoms, you would need to write a conversion script yourself — no such tool ships today.
</details>

<details>
<summary><b>How much knowledge can it handle?</b></summary>

**The design target is 100k+ cards, but this has not been benchmarked.**

The architecture is built for scale: four-layer cards on the filesystem, versioned by Git; `runtime/indexer` generates TSV indexes to speed up lookups; Orbit multi-hop queries are bounded by a layer cap (default 4) and Path Confidence so dense graphs don't explode.

To be honest: **there is no public scale benchmark yet** — 100k+ is a design goal, not a validated number. Real-world performance depends on graph density, query depth, and hardware. If you have measurements, opening an issue will get them added here.
</details>

<details>
<summary><b>What about licensing? Can I use it commercially?</b></summary>

Two layers:

- **Code:** AGPL-3.0. You are free to use, modify, and distribute; but if you offer Noematica as a network service to others, you must publish your source.
- **Knowledge-base content:** CC BY-NC-SA 4.0 — non-commercial, share-alike.

**Commercial licensing is separate:** integrating Noematica into a closed-source product, or avoiding the AGPL network-service clause, requires a commercial license (see `COMMERCIAL_LICENSE.md`). Personal, research, and open-source use is unaffected.
</details>

<details>
<summary><b>How is this different from RAG / vector databases?</b></summary>

**Noematica has no RAG and does not use vector retrieval.** They solve different problems.

RAG solves "**retrieve relevant snippets from a large corpus**" — similarity search at its core. Noematica solves "**why a piece of knowledge holds and what evidence supports it**" — structured reasoning at its core. It relies on explicit entity–relation–observation structure plus multi-hop Path Confidence for ranking, not embedding similarity.

The key difference: with RAG, you can only *trust* that a retrieved snippet is relevant. With Noematica, a returned relation can be **traced along Atoms and Observations all the way back to a Source**, showing what evidence supports it, how confident it is, and whether any conflict was flagged.

They can complement each other: if you already run a RAG system, Noematica can sit on top as a "structured knowledge layer" for queries that need evidence chains and relation evolution. But Noematica itself contains no vector-database component.
</details>

---

## License

- **Source Code:** AGPL-3.0
- **Knowledge Base:** CC BY-NC-SA 4.0
- **Commercial Licensing:** available — see `COMMERCIAL_LICENSE.md`

---

## Contributing

Issues and Pull Requests are welcome. Because this project involves writes into the epistemic layer and a compile step, please read `integration/contracts/*.schema.json` and the relevant `runtime/` service rules before submitting, to make sure changes respect the four-layer boundaries.

---

<div align="center">

**If Noematica saves you time, a ⭐ helps others find it.**

</div>