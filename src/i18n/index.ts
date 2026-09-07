import { createI18n } from 'vue-i18n'
import zh from './zh'
import en from './en'

export type Locale = 'zh' | 'en'

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem('ffmpeg-webui:locale')
    if (saved === 'zh' || saved === 'en') return saved
  } catch { /* ignore */ }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: { zh, en },
})

export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale
  try { localStorage.setItem('ffmpeg-webui:locale', locale) } catch { /* ignore */ }
}
