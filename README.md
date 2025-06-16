# ProgressiveReader

## Prerequisites

- **Android Studio** (latest stable version recommended)
- **JDK** (Java Development Kit) compatible with your Android Studio version

## Building the Android APK

1. **Open the project**

   Launch Android Studio and choose `Open an existing project`. Select the `android/` directory from this repository.

2. **Configure API keys and backend URL**

   Create a `local.properties` file inside the `android/` directory (if it does not already exist) and define any required API keys.
   Add a `BASE_URL` entry pointing to your backend service, for example:

   ```
   BASE_URL=https://your-backend.example.com
   ```

   This value is exposed to the app as `BuildConfig.BASE_URL`.

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

