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
                    bg: '#E6F0FF',
                    navy: '#364D67',
                    blue: '#5F88DE',
                    'blue-light': '#BCD8FF',
                    olive: '#414330',
                    accent: '#F27943',
                    ink: '#364D67',
                },
            },
        },
    },
    plugins: [],
}
