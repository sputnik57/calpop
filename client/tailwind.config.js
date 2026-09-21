/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // CDCR-inspired palette (docs/color_palette_options.md) -- the
                // active frontend palette. Named calpop.* so Tailwind's opacity
                // modifiers (e.g. border-calpop-navy/20) work directly.
                calpop: {
                    // bg was #E6F0FF -- too pale against white cards, washed
                    // out text to near-invisible (flagged 02Sep2026). Reuses
                    // the old blue-light value instead of adding a new hex.
                    bg: '#BCD8FF',
                    navy: '#364D67',
                    blue: '#5F88DE',
                    'blue-light': '#BCD8FF',
                    olive: '#414330',
                    accent: '#F27943',
                    ink: '#364D67',
                    // Recessed/nested surfaces (inputs, table headers, workbench
                    // bars, hover rows) sitting ON white cards. Split out from
                    // `bg` 20Sep2026: `bg` is the page backdrop only (Layout.jsx
                    // + body); reusing it for nested panels put muted text on
                    // the saturated backdrop color and hurt readability.
                    // Same hex as the old bg -- too pale for a page backdrop,
                    // right for a subtle panel tint.
                    panel: '#E6F0FF',
                },
            },
        },
    },
    plugins: [],
}
