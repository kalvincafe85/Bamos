export default function TopBar() {
  return (
    <div className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-2 bg-black px-4">
      <span className="text-base font-bold text-white">Bamos!</span>
      <span className="text-xs text-neutral-400">Beta v1.0</span>
    </div>
  );
}
