import heroLayers from './assets/hero.png'

type Props = { onOpenEditor: () => void }

function StudioMark() {
  return (
    <span className="relative flex size-9 items-center justify-center overflow-hidden rounded-xl bg-violet-500 shadow-[0_0_28px_rgba(139,92,246,0.3)]">
      <span className="absolute -top-3 -left-2 size-8 rounded-full bg-fuchsia-400/80 blur-[6px]" />
      <span className="absolute -right-3 -bottom-4 size-10 rounded-full bg-cyan-300/70 blur-[7px]" />
      <span className="relative text-sm font-black tracking-tighter text-white">S</span>
    </span>
  )
}

function ArrowIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

const features = [
  { number: '01', title: 'Real raster editing', copy: 'Paint, erase, select, mask, transform, and undo directly on mutable pixel layers.' },
  { number: '02', title: 'Layer-first workflow', copy: 'Blend modes, non-destructive adjustments, independent masks, alignment, and compositing.' },
  { number: '03', title: 'Open creative files', copy: 'Work with PNG, JPEG, WebP, layered PSD, and portable Studio project files.' },
  { number: '04', title: 'Local by design', copy: 'Your files stay in your browser. Autosave uses local storage and exports happen on-device.' },
]

export function LandingPage({ onOpenEditor }: Props) {
  return (
    <div className="landing-shell min-h-screen overflow-hidden bg-[#09090b] text-zinc-100">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[720px] bg-[radial-gradient(circle_at_50%_-10%,rgba(124,58,237,0.2),transparent_58%)]" />
      <header className="relative z-20 mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-violet-400">
          <StudioMark />
          <span className="text-[15px] font-semibold tracking-tight text-white">Studio</span>
        </button>
        <nav className="hidden items-center gap-8 text-xs font-medium text-zinc-500 md:flex" aria-label="Main navigation">
          <a href="#features" className="transition hover:text-zinc-100">Features</a>
          <a href="#local-first" className="transition hover:text-zinc-100">Local-first</a>
          <a href="https://github.com/imlunahey/studio" target="_blank" rel="noreferrer" className="transition hover:text-zinc-100">GitHub</a>
        </nav>
        <button type="button" onClick={onOpenEditor} className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-violet-400">
          Open editor <ArrowIcon />
        </button>
      </header>

      <main className="relative">
        <section className="mx-auto max-w-7xl px-5 pt-24 pb-20 text-center sm:px-8 sm:pt-32">
          <div className="mx-auto mb-7 inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-400/[0.07] px-3 py-1.5 text-[10px] font-semibold tracking-[0.16em] text-violet-200/80 uppercase">
            <span className="size-1.5 rounded-full bg-violet-300 shadow-[0_0_10px_#c4b5fd]" /> Private, powerful, browser-native
          </div>
          <h1 className="mx-auto max-w-5xl text-balance text-5xl leading-[0.98] font-semibold tracking-[-0.055em] text-white sm:text-7xl lg:text-[92px]">
            Create without<br /><span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-200 bg-clip-text text-transparent">compromise.</span>
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-pretty text-base leading-7 text-zinc-500 sm:text-lg">
            A serious client-side image editor for layered compositions, raster work, and creative files—without handing your work to a server.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button type="button" onClick={onOpenEditor} className="flex h-12 items-center gap-2 rounded-xl bg-zinc-100 px-6 text-sm font-semibold text-zinc-950 shadow-[0_14px_45px_rgba(255,255,255,0.08)] transition hover:scale-[1.02] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-400">
              Start creating <ArrowIcon />
            </button>
            <a href="https://github.com/imlunahey/studio" target="_blank" rel="noreferrer" className="flex h-12 items-center rounded-xl border border-white/[0.08] px-6 text-sm font-medium text-zinc-400 transition hover:border-white/15 hover:text-white">View source</a>
          </div>

          <div className="relative mx-auto mt-24 max-w-6xl">
            <div className="absolute inset-x-20 -top-14 h-48 rounded-full bg-violet-600/20 blur-[90px]" />
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#111114] p-2 shadow-[0_50px_140px_rgba(0,0,0,0.65)] sm:p-3">
              <div className="flex h-10 items-center gap-2 border-b border-white/[0.07] px-3">
                <span className="size-2.5 rounded-full bg-[#ff6259]" /><span className="size-2.5 rounded-full bg-[#ffbd44]" /><span className="size-2.5 rounded-full bg-[#00ca4e]" />
                <span className="mx-auto -translate-x-7 rounded-md bg-white/[0.04] px-16 py-1.5 font-mono text-[8px] text-zinc-700 sm:px-28">studio.local/app</span>
              </div>
              <div className="grid min-h-72 grid-cols-[64px_1fr_64px] bg-[#0c0c0e] sm:min-h-[540px] sm:grid-cols-[160px_1fr_170px]">
                <div className="border-r border-white/[0.06] p-3 sm:p-5">
                  <div className="h-2 w-8 rounded bg-white/10" /><div className="mt-8 space-y-3"><div className="h-1.5 rounded bg-white/[0.05]" /><div className="h-1.5 w-3/4 rounded bg-white/[0.05]" /><div className="mt-8 h-16 rounded-lg border border-white/[0.05] bg-white/[0.02]" /></div>
                </div>
                <div className="flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.09),transparent_48%)] p-4 sm:p-9">
                  <div className="relative w-full max-w-2xl overflow-hidden rounded-md border border-white/10 bg-zinc-900 shadow-2xl">
                    <img src="/demo-screenshot.svg" alt="A dashboard composition open inside Studio" className="block size-full object-cover" />
                    <span className="absolute inset-0 ring-1 ring-inset ring-white/10" />
                  </div>
                </div>
                <div className="border-l border-white/[0.06] p-3 sm:p-5">
                  <div className="h-2 w-10 rounded bg-white/10" /><div className="mt-7 space-y-2"><div className="h-8 rounded-md bg-violet-400/10 ring-1 ring-violet-300/15" /><div className="h-8 rounded-md bg-white/[0.025]" /><div className="h-8 rounded-md bg-white/[0.025]" /></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-28 sm:px-8">
          <div className="grid gap-10 border-t border-white/[0.07] pt-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-violet-300/70 uppercase">The editor</p>
              <h2 className="mt-4 max-w-md text-4xl leading-tight font-semibold tracking-[-0.04em] text-white sm:text-5xl">The fundamentals are built in—not bolted on.</h2>
            </div>
            <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2">
              {features.map((feature) => (
                <article key={feature.number} className="min-h-52 bg-[#0d0d10] p-7 transition hover:bg-[#111115]">
                  <span className="font-mono text-[10px] text-zinc-700">{feature.number}</span>
                  <h3 className="mt-12 text-base font-semibold text-zinc-100">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-600">{feature.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="local-first" className="mx-auto max-w-7xl scroll-mt-20 px-5 pb-28 sm:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#101014] px-7 py-14 sm:px-14 lg:grid lg:grid-cols-[1fr_0.75fr] lg:items-center lg:gap-20 lg:py-20">
            <div className="absolute -right-28 -bottom-32 size-96 rounded-full bg-violet-600/15 blur-[80px]" />
            <div className="relative">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-cyan-200/70 uppercase">Your work stays yours</p>
              <h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">No upload queue. No processing server. No account wall.</h2>
              <p className="mt-6 max-w-xl text-sm leading-7 text-zinc-500">Studio decodes, edits, saves, and exports on your machine. The same editor package is ready to power the future Electron desktop app from this monorepo.</p>
              <button type="button" onClick={onOpenEditor} className="mt-8 flex items-center gap-2 text-sm font-semibold text-zinc-200 transition hover:text-violet-200">Open the editor <ArrowIcon /></button>
            </div>
            <div className="relative mt-12 flex min-h-60 items-center justify-center lg:mt-0">
              <div className="absolute size-56 rounded-full border border-dashed border-white/10" />
              <div className="absolute size-40 rounded-full border border-white/[0.06]" />
              <img src={heroLayers} alt="Layered surfaces representing local composition" className="relative w-48 drop-shadow-[0_30px_50px_rgba(76,29,149,0.45)]" />
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-white/[0.07]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-5 py-8 text-[11px] text-zinc-700 sm:flex-row sm:px-8">
          <div className="flex items-center gap-2"><StudioMark /><span className="ml-1 font-medium text-zinc-500">Studio</span><span>Client-side creative tools.</span></div>
          <span>React · Vite · Tailwind · pnpm · Turborepo</span>
        </div>
      </footer>
    </div>
  )
}
