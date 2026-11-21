"use client";
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-sm text-gray-500">{error.message}</p>
      <button onClick={reset} className="rounded bg-slate-900 px-4 py-2 text-white">Try again</button>
    </div>
  );
}
