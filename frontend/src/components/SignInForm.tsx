"use client";
import { SignIn } from "@clerk/clerk-react";

export function SignInForm() {
  return (
    <div className="w-full flex justify-center">
      <SignIn />
    </div>
  );
}
