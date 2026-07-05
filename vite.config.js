import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  base: './', // Use relative paths for built assets (for GitHub Pages compatibility)
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'lucide.min.js',
          dest: ''
        },
        {
          src: 'config.js',
          dest: ''
        },
        {
          src: 'manifest.json',
          dest: ''
        },
        {
          src: 'service-worker.js',
          dest: ''
        },
        {
          src: 'robots.txt',
          dest: ''
        },
        {
          src: 'assets/data/*',
          dest: 'assets/data'
        },
        {
          src: 'assets/icons/*',
          dest: 'assets/icons'
        },
        {
          src: 'assets/screenshots/*',
          dest: 'assets/screenshots'
        }
      ]
    })
  ]
});
