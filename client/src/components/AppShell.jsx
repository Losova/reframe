export default function AppShell({
  eyebrow,
  title,
  description,
  asideLines,
  children
}) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-grid bg-[length:72px_72px] opacity-[0.06]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-5 py-5 sm:px-8 sm:py-8 lg:flex-row">
        <aside className="panel flex w-full flex-col justify-between p-8 lg:max-w-md">
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-3 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs uppercase tracking-[0.32em] text-cyan-100">
                <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.9)]" />
                Reframe
              </div>
              <div className="space-y-3">
                <p className="label">{eyebrow}</p>
                <h1 className="max-w-sm text-4xl font-semibold leading-tight text-white sm:text-5xl">
                  {title}
                </h1>
                <p className="max-w-sm text-sm leading-7 text-slate-300 sm:text-base">
                  {description}
                </p>
              </div>
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
              <p className="label">Studio Notes</p>
              <div className="mt-4 space-y-3">
                {asideLines.map((line) => (
                  <div
                    className="flex items-start gap-3 text-sm leading-6 text-slate-300"
                    key={line}
                  >
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amberGlow" />
                    <p>{line}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-8 flex items-center justify-between rounded-[1.75rem] border border-white/10 bg-black/30 px-5 py-4">
            <div>
              <p className="label">Pipeline</p>
              <p className="mt-2 text-sm text-slate-300">Supabase storage, Express delivery, React review link.</p>
            </div>
            <div className="mono rounded-full border border-white/10 px-3 py-2 text-xs text-slate-400">
              MP4
            </div>
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
