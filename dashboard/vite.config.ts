import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages project site: https://<user>.github.io/<repo>/  ->  repo is "automated-business-system".
export default defineConfig({
  base: process.env.DASHBOARD_BASE ?? '/automated-business-system/',
  plugins: [react()],
  build: { target: 'es2020', chunkSizeWarningLimit: 700 },
});
