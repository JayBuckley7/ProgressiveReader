import React from "react";

export function Footer() {
  return (
    <footer className="bg-white border-t mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-6 text-center text-sm text-gray-500">
        <a href="/privacy.html" className="hover:text-gray-700">Privacy Policy</a>
        <span className="mx-2">&bull;</span>
        <a href="/tos.html" className="hover:text-gray-700">Terms of Service</a>
      </div>
    </footer>
  );
}
