export default function Toast({ msg }: { msg: string }) {
  return (
    <div className="fixed left-0 right-0 bottom-[76px] z-50 flex justify-center px-6 pointer-events-none">
      <div className="toast-in max-w-full rounded-xl border border-[#F5B800]/50 bg-[#1E1E1E]/95 backdrop-blur px-4 py-2 text-[11px] font-semibold text-[#F5B800] shadow-gold text-center">
        {msg}
      </div>
    </div>
  );
}
