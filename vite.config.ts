import { copyFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages has no route for paths like /admin/settings, so on a refresh or a bookmark it
// serves 404.html. Making that file a copy of the app lets the app open the right page.
const spaFallback: Plugin = {
  name: 'spa-404-fallback',
  apply: 'build',
  closeBundle() {
    copyFileSync('dist/index.html', 'dist/404.html')
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), spaFallback],
})
