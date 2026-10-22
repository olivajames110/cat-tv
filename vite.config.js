import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on the LAN so phones can open the QR code's link during dev.
    host: true,
    proxy: {
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
})
