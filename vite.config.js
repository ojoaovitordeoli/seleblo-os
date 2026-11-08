import vaultPlugin, { TAILSCALE_HOST } from './plugins/vaultPlugin.js'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), vaultPlugin()],
  server: {
    host: '127.0.0.1',
    strictPort: true,
    allowedHosts: TAILSCALE_HOST ? [TAILSCALE_HOST] : [],
  },
  preview: {
    host: '127.0.0.1',
    strictPort: true,
    allowedHosts: TAILSCALE_HOST ? [TAILSCALE_HOST] : [],
  },
})
