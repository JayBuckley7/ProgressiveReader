import React from "react";

export function Footer() {
  return (
    <footer className="bg-[var(--ui-surface)] border-t app-border mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-6 text-center text-sm app-muted">
        <a href="/privacy.html" className="hover:text-[var(--ui-text)]">Privacy Policy</a>
        <span className="mx-2">&bull;</span>
        <a href="/tos.html" className="hover:text-[var(--ui-text)]">Terms of Service</a>
      </div>
    </footer>
  );
}

