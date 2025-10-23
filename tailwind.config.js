
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'mono': ['SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Menlo', 'Courier New', 'monospace'],
        'sans': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        'vercel-black': '#000000',
        'vercel-gray': '#666666',
        'vercel-light-gray': '#999999',
        'vercel-border': '#eaeaea',
        'vercel-bg': '#fafafa',
      },
    },
  },
  plugins: [],
}
