"use client";
import { SignIn } from "@clerk/clerk-react";

export function SignInForm() {
  return (
    <div className="w-full flex justify-center">
      <SignIn
        appearance={{
          elements: {
            rootBox: "w-full max-w-sm sm:max-w-md p-4",
            card: "shadow-none border border-gray-200 sm:rounded-lg dark:bg-gray-800 dark:border-gray-700",
            headerTitle: "text-2xl font-bold dark:text-white",
            headerSubtitle: "text-gray-600 dark:text-gray-300",
            socialButtonsBlockButton: "w-full",
            formButtonPrimary: "bg-blue-600 hover:bg-blue-700 text-white",
            footerActionLink: "text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300",
          }
        }}
      />
    </div>
  );
}
