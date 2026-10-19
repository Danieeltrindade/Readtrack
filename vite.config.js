import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { buildContentSecurityPolicy, normalizeBasePath } from './build/htmlSecurity.js';

/**
 * Publicação em hospedagem estática (GitHub Pages, Vercel, Netlify…).
 *
 * - BASE_PATH: caminho em que o site fica. No GitHub Pages de um repositório
 *   ("https://usuario.github.io/readtrack/") é "/readtrack/"; o workflow
 *   (.github/workflows/deploy.yml) preenche sozinho. Padrão: "/".
 * - 404.html: cópia do index.html. O GitHub Pages devolve esse arquivo para
 *   qualquer endereço que não existe como arquivo (ex.: /readtrack/app/metas),
 *   e o React Router abre a tela certa — recarregar a página não dá erro.
 * - CSP: inserida no index.html só no build (veja build/htmlSecurity.js).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = normalizeBasePath(process.env.BASE_PATH ?? env.BASE_PATH);
  const csp = buildContentSecurityPolicy({ supabaseUrl: env.VITE_SUPABASE_URL });
  let outDir = 'dist';

  return {
    base,
    plugins: [
      react(),
      {
        name: 'readtrack:static-hosting',
        apply: 'build',
        configResolved(config) {
          outDir = resolve(config.root, config.build.outDir);
        },
        transformIndexHtml() {
          return [
            { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' },
            { tag: 'meta', attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' }, injectTo: 'head' },
          ];
        },
        async closeBundle() {
          await copyFile(resolve(outDir, 'index.html'), resolve(outDir, '404.html'));
        },
      },
    ],
    server: {
      port: 5173,
      open: true,
    },
    build: {
      // Recharts é grande; separá-lo mantém o bundle principal leve.
      rollupOptions: {
        output: {
          manualChunks: {
            charts: ['recharts'],
            vendor: ['react', 'react-dom', 'react-router'],
          },
        },
      },
    },
  };
});
