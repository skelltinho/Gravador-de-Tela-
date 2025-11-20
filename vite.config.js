import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Ponto de entrada do Electron
        entry: 'src/main/main.js',
      },
      {
        entry: 'src/preload.js',
        onstart(options) {
          options.reload()
        },
      },
    ]),
    renderer(),
  ],
})
