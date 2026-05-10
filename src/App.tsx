import { useEffect, useState } from 'react'
import MapView from './components/MapView'
import type { Language, ResolvedTheme, Theme } from './types/settings'
import './app.css'

const TEXT = {
  zh: {
    subtitle: 'Overture Maps 全球铁路网络可视化',
    theme: '主题',
    auto: '自动',
    dark: '深色',
    light: '浅色',
    language: '语言',
    languages: {
      zh: '中文',
      ja: '日本語',
      en: 'English',
    },
  },
  ja: {
    subtitle: 'Overture Maps 世界鉄道ネットワーク可視化',
    theme: 'テーマ',
    auto: '自動',
    dark: 'ダーク',
    light: 'ライト',
    language: '言語',
    languages: {
      zh: '中文',
      ja: '日本語',
      en: 'English',
    },
  },
  en: {
    subtitle: 'Overture Maps global rail network visualization',
    theme: 'Theme',
    auto: 'Auto',
    dark: 'Dark',
    light: 'Light',
    language: 'Language',
    languages: {
      zh: '中文',
      ja: '日本語',
      en: 'English',
    },
  },
} as const

const THEMES: Theme[] = ['auto', 'dark', 'light']
const LANGUAGES: Language[] = ['zh', 'ja', 'en']

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export default function App() {
  const [theme, setTheme] = useState<Theme>('auto')
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme)
  const [language, setLanguage] = useState<Language>('zh')
  const text = TEXT[language]
  const resolvedTheme = theme === 'auto' ? systemTheme : theme

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const updateSystemTheme = () => setSystemTheme(media.matches ? 'light' : 'dark')
    updateSystemTheme()
    media.addEventListener('change', updateSystemTheme)
    return () => media.removeEventListener('change', updateSystemTheme)
  }, [])

  return (
    <div className={`app app-${resolvedTheme}`}>
      <header className="app-header">
        <div className="brand-block">
          <h1>Global Rail</h1>
          <span className="app-subtitle">{text.subtitle}</span>
        </div>

        <div className="app-controls" aria-label="Display controls">
          <div className="segmented-group" aria-label={text.theme}>
            <span className="control-label">{text.theme}</span>
            <div className="segmented-control">
              {THEMES.map(value => (
                <button
                  key={value}
                  className={theme === value ? 'active' : undefined}
                  onClick={() => setTheme(value)}
                  type="button"
                >
                  {text[value]}
                </button>
              ))}
            </div>
          </div>

          <div className="segmented-group" aria-label={text.language}>
            <span className="control-label">{text.language}</span>
            <div className="segmented-control">
              {LANGUAGES.map(value => (
                <button
                  key={value}
                  className={language === value ? 'active' : undefined}
                  onClick={() => setLanguage(value)}
                  type="button"
                >
                  {text.languages[value]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>
      <main className="app-body">
        <MapView theme={resolvedTheme} language={language} />
      </main>
    </div>
  )
}
