// Build: npx tailwindcss@3.4.17 -c tailwind.config.js -o tailwind.css --minify
// Re-run after changing classes in index.html (CI also rebuilds it).
module.exports = {
    content: ['./index.html'],
    theme: {
        extend: {
            colors: {
                darkBg: '#090d0b',
                cardBg: '#121a15',
                borderGreen: '#1b3b2b',
                neonGreen: '#00FF66',
                emeraldHover: '#059669',
            },
            fontFamily: {
                sans: ['Prompt', 'sans-serif'],
            },
        },
    },
};
