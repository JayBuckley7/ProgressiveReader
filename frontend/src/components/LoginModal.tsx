// import { Authenticated, Unauthenticated } from "convex/react";
import { SignInForm } from "./SignInForm";

export function LoginModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">Sign In</h2>
            <button onClick={onClose} aria-label="Close login form" className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <SignInForm />
        </div>
      </div>
    </div>
  );
}
