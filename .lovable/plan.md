
# Roadmap: from scene-list editor → professional video tool

The current editor is a **vertical scene list** with per-scene fields and a Remotion preview. To approach Premiere/After Effects/Vyond, we add capabilities in layers that each ship independently and stay usable on their own. Each phase ends in a working app — no half-built timeline left dangling.

---

## Phase 1 — Editor foundations (quick wins, no new data model)

Goal: make today's editor feel pro before changing anything structural.

1. **Playback controls** — play/pause, scrub bar, current-time / total-time display, J-K-L and space shortcuts, frame-step arrows, loop toggle.
2. **Preview quality + zoom** — fit / 50% / 100% / 200%, safe-area + title-safe overlays, optional grid.
3. **Keyboard shortcuts** — duplicate scene (⌘D), delete (⌫), reorder (⌥↑/↓), undo/redo (⌘Z / ⇧⌘Z) using a simple history stack on `scenes`.
4. **Scene thumbnails** — render a tiny still per scene in the left rail (Remotion `<Thumbnail>` or first-frame canvas).
5. **Inspector panel polish** — collapse the inline form into a right-hand inspector with grouped sections (Content / Style / Timing).

Ship criterion: editor still works exactly as today, just faster and more comfortable.

---

## Phase 2 — Real timeline (single track)

Goal: replace the vertical card list with a horizontal timeline like Premiere's basic mode.

- New `Timeline` component: horizontal ruler in seconds, blocks per scene scaled by `durationFrames / fps`.
- **Drag to reorder**, **drag right edge to trim duration**, snap to 0.5 s grid.
- Playhead synced to Remotion `Player` ref (`getCurrentFrame`, `seekTo`).
- Click a block → selects it in the inspector (Phase 1).
- Keep the scene-list view as an alt "storyboard mode" toggle.

Data model: unchanged. Still one ordered array of scenes.

---

## Phase 3 — Multi-track timeline (video / overlay / audio)

Goal: stop forcing everything into one stack. Vyond/Premiere give you parallel lanes.

- Schema change (migration): each scene gets `track: number` and `startFrame: number`. Duration stays. Order is derived from `startFrame`, not array index.
- Tracks rendered top-to-bottom: **V2 overlay**, **V1 main**, **A1 voiceover**, **A2 music**.
- Audio becomes per-clip instead of one global `audio_url`: an "Audio clip" scene type with waveform thumbnail (generated client-side via WebAudio `AudioBuffer`).
- Render-time: Remotion composition iterates clips and places each via `<Sequence from={startFrame} durationInFrames={...}>`; overlapping tracks compose with z-index.

Migration risk: rewrite existing projects on load — map array order to sequential `startFrame`, all on `track: 1`.

---

## Phase 4 — Per-clip transforms & keyframes (After Effects-lite)

Goal: animate properties over time, not just per-scene.

- Each video/image clip gets a `transform` block: `position`, `scale`, `rotation`, `opacity`, `crop`.
- **Keyframe model**: `keyframes: { property: string; frame: number; value: number; easing: 'linear'|'ease-in'|'ease-out'|'ease-in-out' }[]`.
- Inspector grows a "Properties" section with a small keyframe strip per property (diamond markers, click to add at playhead).
- Remotion `interpolate()` between adjacent keyframes per property at render.
- Common presets: Ken Burns, fade in/out, slide in from edge, scale-up reveal — one-click buttons that insert a keyframe pair.

---

## Phase 5 — Transitions between clips

Goal: cross-dissolve, fade-to-black, wipe, slide.

- Transition lives between two adjacent clips on the same track, with `kind` and `durationFrames`.
- Rendered via Remotion's `@remotion/transitions` package (`<TransitionSeries>`).
- UI: small handle on the seam between two timeline blocks → opens a transition picker.

---

## Phase 6 — Text engine (After Effects-style titles)

Goal: replace today's hard-coded text scenes with composable text layers.

- Text becomes a **layer** (overlay track), not a scene type. Multiple text layers can stack on one video clip.
- Per-layer: font (bound to TU brand stack), weight, size, color (palette tokens), alignment, line-height, letter-spacing, shadow, stroke, background box.
- Animation presets: typewriter, slide-up per word, fade-per-letter, kinetic (bounce-in).
- Built on Remotion's `@remotion/google-fonts` + `interpolate` per character.

---

## Phase 7 — Asset library & media bin

Goal: a single place that owns every asset across projects (Premiere "Project panel").

- Unify `video_uploads`, `org_videos`, audio uploads, image uploads, Pexels picks, and rendered exports into one **Media Bin** UI.
- Tabs: My media · Org library · Stock · Generated · Recent.
- Drag from bin onto the timeline to create a clip at the playhead.
- Already-built upload + auto-tagging from previous turns plugs in here.

---

## Phase 8 — Effects & color (FX panel)

Goal: per-clip filters like Premiere's Lumetri.

- Effects: brightness, contrast, saturation, hue-rotate, blur, vignette, LUT (start with 4 brand-friendly LUTs as PNG cubes).
- Implemented as CSS filter on the `<Video>` / `<OffthreadVideo>` element in Remotion (no GPU shader needed for v1).
- Per-clip "Adjustments" inspector section. Each effect is keyframable (reuses Phase 4).

---

## Phase 9 — Voiceover & captions

Goal: built-in narration without leaving the editor.

- **Record VO** in-browser → uploads to `video-audio` bucket → drops as A1 clip on the timeline.
- **Auto-captions** via Lovable AI Gateway (Whisper-class model) → generates `.srt` → renders as a synced subtitle track with brand styling.
- Editable caption table; clicking a row jumps the playhead.

---

## Phase 10 — Templates, motion graphics packs, collaboration

The "Vyond" layer. Optional, only if usage justifies it.

- **Brand kit**: stored colors, fonts, logo, intro/outro stings — applied across all projects.
- **Templates**: starter projects (lecture intro, announcement, course trailer) seeded by admins via the existing org library system.
- **Motion graphics presets**: pre-built lower-thirds, callouts, transitions saved as reusable JSON snippets.
- **Comments on the timeline** (frame-anchored notes) for review workflows.
- **Shared projects** with role-based access (viewer / editor) — needs a new `project_collaborators` table with RLS.

---

## Cross-cutting concerns (apply from Phase 2 onward)

- **Performance**: timeline must stay 60 fps with 100+ clips → virtualize the track view, memoize scene cards.
- **Autosave**: keep the debounced pattern; add an **explicit version history** (snapshot row in `project_versions` per save, last 50, restore button).
- **Render worker**: every new feature must round-trip cleanly to the Hetzner worker. Each phase ends with a render smoke test on a real project.
- **Mobile**: editor stays desktop-only. We'll add a dedicated mobile *playback/review* view, not editing.

---

## Suggested sequencing

```text
P1 Foundations   → 1 short iteration   (UX only, no schema)
P2 Timeline v1   → 1 iteration          (same schema, new view)
P3 Multi-track   → 1 iteration + migr.  (schema change, biggest jump)
P4 Keyframes     → 1–2 iterations
P5 Transitions   → small
P6 Text engine   → 1–2 iterations
P7 Media Bin     → 1 iteration (mostly UI on existing data)
P8 Effects       → 1 iteration
P9 VO + captions → 1 iteration (AI Gateway)
P10 Brand kit / templates / collab → on demand
```

Each phase is independently shippable — we can stop after any of them and the editor still works. Recommend committing to **P1 + P2** first; that alone makes it feel like a real editor.

## Open questions before we start

1. Which phase should we tackle first — P1 (polish) or jump straight to P2 (timeline)?
2. Is multi-track (P3) actually needed for your use case, or is a single track + overlays enough? It's the biggest data-model change in the whole roadmap.
3. Any reference editor you want me to mimic most closely — Premiere, Descript, CapCut Web, or Vyond?
