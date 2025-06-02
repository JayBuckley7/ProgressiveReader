"use client";
import { SignIn } from "@clerk/clerk-react";

export function SignInForm() {
  return (
    <div className="w-full flex justify-center">
      <SignIn 
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "shadow-none",
            headerTitle: "text-2xl font-bold",
            headerSubtitle: "text-gray-600",
            socialButtonsBlockButton: "w-full",
            formButtonPrimary: "bg-blue-600 hover:bg-blue-700 text-white",
            footerActionLink: "text-blue-600 hover:text-blue-700",
          }
        }}
      />
    </div>
  );
}
