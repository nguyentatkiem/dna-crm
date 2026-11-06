"use client";

export function RetryButton() {
  return (
    <button className="btn-primary mx-auto mt-5" onClick={() => (navigator.onLine ? window.location.assign("/w") : window.location.reload())}>
      Thử lại
    </button>
  );
}
