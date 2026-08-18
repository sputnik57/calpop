# Frontend Color Palette Options

Two palettes were explored while mocking up the 5-tab frontend redesign
(see `implementation_plan.md` for that effort's status). Recorded here so
neither has to be reconstructed from scratch later.

## Active: CDCR palette (in use)

Referred to during design review as the "jail attire" colors -- chosen
deliberately over generic dashboard blue/cyan and over a warmer/pastel
alternative (see below) for its own reasons, not to be read as a generic
"corporate" or "friendly" palette.

| Swatch | Hex | Role |
|---|---|---|
| Light blue | `#BCD8FF` | (reserved, not yet placed in a role) |
| Mid blue | `#5F88DE` | Links, active nav-item fill, icon strokes, identifiers (CPID), interactive text |
| Dark navy | `#364D67` | Header bar background, primary body text tint (as `rgba(54,77,103,x)` for muted text/borders) |
| Dark olive | `#414330` | Calm/routine status (e.g. "Safe", "queued_for_writing", "sent") |
| Orange | `#F27943` | The one accent -- primary buttons (CTA), active-tab underline, alert/unsafe status, "needs routing" |

Page background: `#E6F0FF` (a light tint, not pure white -- requested
after the initial white-background pass read as too stark against the
navy header and white cards).

Cards stay white (`#FFFFFF`) against the tinted page background --
intentional, for contrast; explored and rejected the "flatten everything,
no card boxes" alternative in the same review.

## Reference only: pastel palette (not in use)

Explored as an alternative, rejected in favor of the CDCR palette above
("keep both of these palettes in a doc and use the original one, not
this pastel one").

| Swatch | Hex | Role (as applied) |
|---|---|---|
| Pale blue | `#E6F0FF` | Page background (this pass used pure white instead per a later request) |
| Blue-gray | `#BDC7DE` | (reserved, not yet placed in a role) |
| Mid blue | `#5E85B3` | Header bar background, links, icon strokes, identifiers |
| Sage/olive | `#ADB380` | Calm/routine status (fill only -- text used a darkened derivative, see below) |
| Peach | `#F2AA8A` | The one accent -- buttons, active-tab underline, alert/unsafe status |

Contrast note: because the peach and sage tones are light, raw hex values
don't have enough contrast for small text/icons on light backgrounds.
Two derived (darkened) shades were used specifically for that:
`#C2653A` (from the peach, for badge/label text and the active-tab
underline+label) and `#6B7048` (from the sage, for status-badge text and
small icon fills). The peach itself was kept for solid fills (buttons,
badge background tints, the active-nav pill) where a dark label sits on
top of it.

Subjective read at the time: "gives a happier vibe" -- flagged as a
possible mismatch with the subject matter (safety classifications,
redaction, prisoner correspondence) versus the more institutional CDCR
palette above.
