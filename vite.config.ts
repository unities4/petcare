import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Хостинга пока нет, приложение открывается с dev-сервера по локальной сети
// (ADR-009). host: true заставляет Vite слушать 0.0.0.0, иначе телефон не достучится.
export default defineConfig({
  server: { host: true, port: 5173, strictPort: true },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Регистрируем сами в main.tsx: по http://192.168.x.x service worker
      // недоступен в принципе, и автоматическая попытка только сыплет ошибками.
      injectRegister: null,
      // devOptions намеренно выключены. Они отдают манифест в dev, но заодно
      // насильно внедряют регистрацию dev-service-worker в обход injectRegister,
      // а по http://192.168.x.x она не может не падать. Установку на iOS
      // обеспечивают apple-мета в index.html, манифест для неё не обязателен;
      // сам манифест проверяется на сборке (npm run build).
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],
      // По http://192.168.x.x service worker не зарегистрируется — это не secure
      // context. Конфигурация верная, проверить её можно будет только по HTTPS.
      manifest: {
        name: 'PetCare',
        short_name: 'PetCare',
        description: 'Дневник питания и симптомов питомца',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#2f6f4e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
