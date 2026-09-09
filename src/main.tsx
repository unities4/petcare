import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import './index.css'

const queryClient = new QueryClient()

// Service worker живёт только в secure context (https или localhost), а по локальной
// сети его не будет вовсе — это ожидаемо, см. ADR-009. В разработке он не нужен и
// только мешает: dev-версия скрипта пересобирается на каждое изменение.
if (import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
