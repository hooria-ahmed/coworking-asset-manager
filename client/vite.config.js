import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In development, /api calls are forwarded to the Express server on port 5000.
// "@/..." imports point at src/ (used by the shadcn/ui components in src/components/ui/).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  build: {
    rollupOptions: {
      output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], charts: ['chart.js', 'react-chartjs-2'], ui: ['radix-ui', 'lucide-react', 'sonner'] } },
    },
  },
  server: { port: 5173, proxy: { '/api': 'http://localhost:5000' } },
});
