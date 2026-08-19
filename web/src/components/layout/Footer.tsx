// FR12: shield icon + face-photo trust note, shown on every page. The copyright line is kept as
// a smaller secondary line underneath rather than dropped (see plan Q6).
export function Footer() {
  return (
    <footer className="flex flex-col items-center justify-center gap-2 border-t border-border bg-bg/92 px-6 py-4 text-center text-text-muted">
      <div className="flex items-center gap-[0.6rem] text-[0.85rem]">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 2l8 4v6c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-4z" />
        </svg>
        {/* my-[1em] restores the browser default <p> margin that Tailwind's preflight removes. */}
        <p className="my-[1em]">Ảnh khuôn mặt của bạn không bao giờ được lưu trữ hay chia sẻ — chỉ dùng để phân tích tức thời.</p>
      </div>
      <p className="text-xs">&copy; {new Date().getFullYear()} Smart Eyewear</p>
    </footer>
  );
}
