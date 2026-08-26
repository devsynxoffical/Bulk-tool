export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-4 p-1">
      <div className="h-7 w-48 rounded-md bg-zinc-200/80" />
      <div className="h-4 w-80 max-w-full rounded-md bg-zinc-100" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl border border-zinc-100 bg-white p-4"
          >
            <div className="h-3 w-20 rounded bg-zinc-100" />
            <div className="mt-3 h-6 w-16 rounded bg-zinc-200/70" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="h-64 rounded-xl border border-zinc-100 bg-white" />
        <div className="h-64 rounded-xl border border-zinc-100 bg-white" />
      </div>
    </div>
  );
}
