import { SignInForm } from "./SignInForm";

export function LoginModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
      <div className="app-card max-w-md w-full">
        <div className="px-6 py-4 border-b app-border flex justify-between items-center">
          <h2 className="text-lg font-semibold">Sign In</h2>
          <button
            onClick={onClose}
            aria-label="Close login form"
            className="p-1.5 app-icon-button transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">
          <SignInForm />
        </div>
      </div>
    </div>
  );
}
