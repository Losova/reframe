export default function AppShell({
  eyebrow,
  title,
  description,
  asideLines,
  children
}) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:54px_54px]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[92rem] flex-col gap-5 px-4 py-4 sm:px-7 sm:py-7 lg:flex-row">
        <aside className="panel flex w-full flex-col justify-between p-7 lg:max-w-[24rem]">
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-3 rounded-full border border-stone-700 bg-black/25 px-4 py-2 text-xs uppercase tracking-[0.32em] text-stone-200">
                <span className="h-2 w-2 rounded-full bg-amber-300" />
                Reframe
              </div>
              <div className="space-y-3">
                <p className="label">{eyebrow}</p>
                <h1 className="max-w-sm text-4xl font-semibold leading-[0.95] tracking-[-0.055em] text-white sm:text-5xl">
                  {title}
                </h1>
                <p className="max-w-sm text-sm leading-7 text-stone-300 sm:text-base">
                  {description}
                </p>
              </div>
            </div>
            <div className="rounded-[1.35rem] border border-stone-700/70 bg-black/25 p-5">
              <p className="label">Studio Notes</p>
              <div className="mt-4 space-y-3">
                {asideLines.map((line) => (
                  <div
                    className="flex items-start gap-3 text-sm leading-6 text-stone-300"
                    key={line}
                  >
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amberGlow" />
                    <p>{line}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-8 flex items-center justify-between rounded-[1.35rem] border border-stone-700/70 bg-stone-950/70 px-5 py-4">
            <div>
              <p className="label">Pipeline</p>
              <p className="mt-2 text-sm text-stone-300">Supabase storage, Express delivery, React review link.</p>
            </div>
            <div className="mono rounded-full border border-stone-700 px-3 py-2 text-xs text-stone-400">
              MP4
            </div>
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
