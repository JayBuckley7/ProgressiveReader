# Android build

The Android app is a Kotlin Multiplatform/Compose application in `composeApp`.

From the repository root, run:

```powershell
.\android.ps1 verify
```

The wrapper locates a Java 17+ runtime and the Android SDK without changing machine-wide environment variables. It then runs unit tests, Android lint, and a debug APK build.

Useful commands:

```powershell
.\android.ps1 doctor
.\android.ps1 lint
.\android.ps1 build
.\android.ps1 install
.\android.ps1 connectedTest
```

Debug builds may run without Clerk configuration and show sign-in as unavailable. Release builds require `CLERK_PUBLISHABLE_KEY` or `VITE_CLERK_PUBLISHABLE_KEY`.

The debug APK is written to `kmp/composeApp/build/outputs/apk/debug/composeApp-debug.apk`.
