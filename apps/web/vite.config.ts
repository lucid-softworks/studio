import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import typegpuPlugin from 'unplugin-typegpu/vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [typegpuPlugin(), react(), tailwindcss()],
  optimizeDeps: { include: ['ag-psd'] },
})
