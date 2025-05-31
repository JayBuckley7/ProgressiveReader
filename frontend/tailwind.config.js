module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../templates/**/*.html'],
  theme: { extend: {} },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')]
};
