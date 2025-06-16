# ProgressiveReader

## Prerequisites

- **Android Studio** (latest stable version recommended)
- **JDK** (Java Development Kit) compatible with your Android Studio version

## Building the Android APK

1. **Open the project**

   Launch Android Studio and choose `Open an existing project`. Select the `android/` directory from this repository.

2. **Configure API keys**

   Set any required API keys in `local.properties` or your build configuration. Refer to the codebase for specific key names.

3. **Assemble the release build**

   From the command line, run the following command in the `android/` directory:

   ```bash
   ./gradlew assembleRelease
   ```

   The generated APK will be located at `android/app/build/outputs/apk/release/app-release.apk`.

4. **Optional: Build a debug APK**

   For quick testing you can create a debug build instead:

   ```bash
   ./gradlew assembleDebug
   ```

   The debug APK will be in `android/app/build/outputs/apk/debug/app-debug.apk`.

5. **Optional: Install to a connected device**

   To automatically install the debug build on a running emulator or device:

   ```bash
   ./gradlew installDebug
   ```

   You can also use Android Studio's Run button to deploy directly.


## Continuous Integration

GitHub Actions automatically builds the Android release with `./gradlew assembleRelease`. Containerized builds have been removed.
