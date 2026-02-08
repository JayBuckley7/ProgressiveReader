"use client";
import { ClerkLoaded, ClerkLoading, SignUp } from "@clerk/clerk-react";
import { Capacitor } from "@capacitor/core";

export function SignUpForm() {
  const redirectUrl = Capacitor.getPlatform() === 'android'
    ? 'myapp://clerk-auth'
    : '/';

  return (
    <div className="w-full flex justify-center">
      <ClerkLoading>
        <div className="w-full max-w-md flex items-center justify-center py-8 text-gray-500">
          Loading sign-up…
        </div>
      </ClerkLoading>
      <ClerkLoaded>
        <SignUp routing="virtual" forceRedirectUrl={redirectUrl} />
      </ClerkLoaded>
    </div>
  );
}


