# Dose Chain Log — visual thesis

## Direction: the midnight dose sequencer

Dose Chain Log borrows the precision of a demoscene tracker and the calm glow
of bedside electronics: medicines are “channels”, a shared window is a “set”,
and each actual dose starts a visible chain. This is a pixel language used for
clarity, not gamification. Hard one-pixel edges, stepped timelines and compact
status glyphs make temporal relationships legible in a glance. The interface is
explicitly single-mode and dark so it is predictable during early and late
medication windows; the background is always painted.

The primary screen must answer two questions inside two seconds: “What is due?”
and “What can I confirm together?” The large group-confirm button dominates;
history, setup and commercial detail recede.

## Palette

All values are CSS tokens. The colors come from a quiet bedside LCD: near-black
housing, blue-black glass, warm phosphor for attention, and mint for a confirmed
signal.

| Token | Value | Use |
| --- | --- | --- |
| `--ink-0` | `#080B13` | page background |
| `--ink-1` | `#101626` | raised surface |
| `--ink-2` | `#18223A` | control surface |
| `--line` | `#34415F` | boundaries and inactive pixels |
| `--text` | `#F4F0E6` | primary copy |
| `--muted` | `#B8C2D8` | secondary copy (7.9:1 on background) |
| `--amber` | `#FFD166` | primary action / due signal |
| `--amber-ink` | `#171108` | text on amber |
| `--mint` | `#72F1B8` | taken / successful chain |
| `--cyan` | `#67D4FF` | links / next timer |
| `--coral` | `#FF8E7A` | late / destructive warning |
| `--danger` | `#FFB0AA` | safety and errors |

State always includes a word and, where useful, a shape; color is never the
only signal. Contrast targets WCAG AA (4.5:1 text, 3:1 focus/UI).

## Type

- Display / labels: `"Courier New", ui-monospace, monospace`. Uppercase only
  for tiny tracker labels, with generous letter spacing. This yields the pixel
  voice without shipping a font payload.
- Reading / controls: `Inter, ui-sans-serif, system-ui, sans-serif`. The system
  face keeps medicine names and safety copy calm and highly legible.
- Scale: 12 / 14 / 17 / 20 / 28 / clamp(36–56) px. Body is 17px minimum;
  numeric times use tabular figures.

## Space, shape and depth

An 8px base rhythm with 4px for micro-spacing. Page gutters are 16px on a
390px phone, growing to 32px. Touch targets are at least 48px and adjacent
targets have at least 8px. Corners are deliberately clipped at 6px (not round
cards); panels use a one-pixel line plus an offset pixel shadow. Grouping is by
proximity first. Cards appear only for independent dose windows and settings.

The phone view drops decorative desktop labels, stacks the two-column layout,
and keeps the primary group action in the content flow so it never covers a
notch or keyboard. Bottom safe-area padding uses `env(safe-area-inset-bottom)`.

## Interaction grammar

- A due window is a horizontal “track”. Medicines are rows on that track.
- “Mark all taken” is the principal command. One tap records the actual time
  and schedules every configured follow-up from that timestamp.
- Skip/late are quieter per-event alternatives and require explicit choices.
- Setup uses native inputs in focused dialogs. Dialogs restore focus on close.
- Every mutation produces a live announcement and a reversible Undo toast.
- Follow-ups render as stepped segments: recorded event → interval → next due.
- Empty states lead directly to “Create first window”. Offline status explains
  that all logging continues locally.

## Motion

State changes use a single 180ms stepped fade/translate (`steps(3, end)`) that
appears to advance a tracker cursor. Toasts rise from their originating action.
Nothing loops and nothing flashes. Under `prefers-reduced-motion: reduce`, all
transforms and stepped motion become instant opacity changes; logical depth is
preserved by borders, scale and contrast.

## Original asset plan and provenance

One generated raster hero, `assets/src/dose-sequencer.png`, shows three medicine
modules feeding a stepped clock chain. It is explanatory atmosphere for the
empty/setup state, never a screenshot or claim of medical intelligence. The
shipping derivatives are WebP at 720px and 1080px, each with fixed dimensions;
the smaller is kept below 300 KB. App icons are hand-authored SVG/PNG based on
an original “linked D” pixel mark; other interface icons are CSS or inline SVG.

Prompt sheet:

> Use case: stylized-concept. Asset type: compact PWA onboarding illustration.
> A calm isometric pixel-art bedside medication sequencer: three abstract,
> unbranded medicine modules aligned on the left, each sending one luminous
> mint signal into a stepped amber timeline and a small digital clock node.
> Demoscene pixel illustration, crisp 1-bit edges with restrained 16-bit color,
> dark navy electronics, warm phosphor amber, mint and small cyan highlights,
> matte plastic and dark glass, straight-on three-quarter view, generous dark
> negative space, reassuring and precise rather than playful. No people, no
> pills identifiable by brand, no text, no numbers, no watermark, no logos,
> no gradients, no glossy 3D, no medical cross, no hearts, no fantasy elements.

Generation provenance: Azure OpenAI Foundry factory image deployment via
`/opt/fleet/lib/gen-image.sh`, generated 2026-08-28. Original generated asset;
no third-party source material. The prompt is also stored beside the source in
`assets/src/dose-sequencer.prompt.json`. Generated imagery is disclosed in the
application footer.

## Safety tone

The interface never recommends doses, flags interactions, or labels adherence
as good/bad. It records what the person says happened. Persistent boundary copy
states: use the prescribed instructions; for urgent symptoms, overdose, or an
emergency contact local emergency services or poison control. Scheduling copy
says “log” and “follow-up reminder”, never “safe to take”.
