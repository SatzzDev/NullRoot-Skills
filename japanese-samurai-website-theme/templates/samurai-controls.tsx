// Known-good samurai-themed interactive controls — copy + adapt into a Next.js + Tailwind v4 app.
// All use the tokens from templates/samurai-globals.css (--color-aka, --color-kin, --color-sumie, --color-washi).

/* ============ 1. ScrollToTop — vermilion→gold gradient progress ring ============ */
'use client'
import { useState, useEffect } from 'react'
import { ArrowUp, ChevronsUp } from 'lucide-react'

export function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)
  useEffect(() => {
    const onScroll = () => {
      const scrolled = window.pageYOffset
      const max = document.documentElement.scrollHeight - window.innerHeight
      setScrollProgress(max > 0 ? (scrolled / max) * 100 : 0)
      setIsVisible(scrolled > 300)
    }
    window.addEventListener('scroll', onScroll); onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  if (!isVisible) return null
  const C = 2 * Math.PI * 46
  return (
    <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="group fixed bottom-8 right-6 z-40 h-14 w-14 rounded-full bg-sumie/80 backdrop-blur-md border border-aka/40 hover:border-aka-bright shadow-[0_0_20px_rgba(200,16,46,0.35)] transition-all duration-300 hover:scale-110 hover:-translate-y-1"
      aria-label="Return to the top">
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(236,227,210,0.08)" strokeWidth="4" />
        <circle cx="50" cy="50" r="46" fill="none" stroke="url(#sg)" strokeWidth="4"
          strokeDasharray={C} strokeDashoffset={C * (1 - scrollProgress / 100)}
          className="transition-all duration-150" strokeLinecap="round" />
        <defs><linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c8102e" /><stop offset="100%" stopColor="#eccb5e" />
        </linearGradient></defs>
      </svg>
      <div className="relative flex items-center justify-center h-full">
        <ArrowUp className="w-6 h-6 text-washi group-hover:hidden" />
        <ChevronsUp className="w-6 h-6 text-aka-bright hidden group-hover:block animate-bounce" />
      </div>
    </button>
  )
}

/* ============ 2. Social icons — inline brand SVGs in sumi tiles ============ */
const InstagramIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" />
    <line x1="17.5" y1="6.5" x2="17.5" y2="6.5" />
  </svg>
)
const GithubIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.27 2.75 1.05a9.4 9.4 0 0 1 5 0c1.91-1.32 2.75-1.05 2.75-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.06 10.06 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
  </svg>
)

export function SocialRow() {
  const SOCIAL = [
    { icon: InstagramIcon, href: 'https://instagram.com/krniwnstria', label: 'Instagram' },
    { icon: GithubIcon, href: 'https://github.com/kurniawansatria', label: 'GitHub' },
    { icon: (p: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>, href: 'mailto:satganzdevs@gmail.com', label: 'Email' },
  ]
  return (
    <div className="flex gap-3">
      {SOCIAL.map((s) => (
        <a key={s.label} href={s.href} target="_blank" rel="noreferrer" aria-label={s.label}
          className="group relative w-12 h-12 rounded-xl bg-black/50 border border-aka/30 hover:border-aka-bright overflow-hidden flex items-center justify-center transition-all duration-300 hover:scale-110 hover:shadow-[0_0_18px_rgba(200,16,46,0.45)]">
          <span className="absolute inset-0 bg-gradient-to-br from-aka/20 to-kin/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          <s.icon className="w-6 h-6 text-washi-dim group-hover:text-washi relative z-10 transition-colors" />
        </a>
      ))}
    </div>
  )
}

/* ============ 3. Music toggle — labeled pill, not a bare hanko ============ */
'use client'
import { useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'

export function MusicToggle({ src = '/AURA of GLORY.mp3', title = 'AURA of GLORY' }: { src?: string; title?: string }) {
  const [playing, setPlaying] = useState(false)
  const ref = useRef<HTMLAudioElement | null>(null)
  const toggle = () => {
    const a = ref.current; if (!a) return
    playing ? a.pause() : a.play().catch(() => {})
    setPlaying(!playing)
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <button onClick={toggle}
        className="group relative flex items-center gap-3 px-5 py-2.5 rounded-full bg-black/40 border border-aka/40 hover:border-aka-bright transition-all duration-300 hover:scale-105 hover:shadow-[0_0_18px_rgba(200,16,46,0.4)]"
        aria-label="toggle battle music">
        <span className={`flex items-center justify-center w-8 h-8 rounded-full ${playing ? 'bg-aka/30' : 'bg-aka/20'} text-aka-bright`}>
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </span>
        <span className="font-serif-jp text-washi-dim group-hover:text-washi text-sm tracking-wide">
          {playing ? 'Silence the Drum' : 'Sound the War Drum'}
        </span>
      </button>
      <span className="font-sans-jp text-washi-dim/50 text-xs">♪ {title}</span>
      <audio ref={ref} loop><source src={src} type="audio/mpeg" /></audio>
    </div>
  )
}
