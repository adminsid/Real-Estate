# Native Mobile App Packaging Guide (Capacitor)

This guide documents the layout and procedure for building and packaging the **Prime America Workspace** as a native iOS and Android application using [Capacitor](https://capacitorjs.com/).

---

## Architecture Overview

Instead of maintaining a separate Swift/Kotlin codebase, we package the PWA assets inside a native WebView container.

The configuration at `/mobile-shell/capacitor.config.json` points to `https://workspace.primeamericany.com` for its live server fallback, ensuring:
- **Instant Hot Updates:** Any changes deployed to the gateway cloud worker are instantly updated on agents' mobile apps without rebuilding or submitting to the App Store.
- **Native Device APIs:** The app has access to geolocation, camera, biometric auth, and notifications.

---

## Prerequisites

1. **Node.js** (v18+)
2. **Xcode** (for iOS builds, macOS required)
3. **Android Studio** (for Android builds)
4. **Cocoapods** (`sudo gem install cocoapods`)

---

## Setup & Scaffolding Steps

Navigate to the `mobile-shell` directory to run all commands:

```bash
cd mobile-shell
```

### 1. Install Dependencies
```bash
npm install
```

### 2. Scaffold Native Platform Projects
Run the following commands to initialize the Xcode project and Android Studio projects:

```bash
# Add iOS platform
npx cap add ios

# Add Android platform
npx cap add android
```

### 3. Synchronize Web Code and Plugins
Whenever you make updates to the config or icons, sync them to the native platforms:

```bash
npx cap sync
```

---

## Running in Development (Simulators / Physical Devices)

You can launch and run the app locally on a connected device or simulator:

```bash
# Run on iOS Simulator
npx cap run ios

# Run on Android Emulator
npx cap run android
```

---

## Production Build & Distribution

### iOS (App Store)
1. Run `npx cap open ios` to open the workspace in **Xcode**.
2. Select your development team in the "Signing & Capabilities" tab.
3. Select "Any iOS Device (arm64)" as the target.
4. Go to **Product > Archive**.
5. Once the archive is ready, click **Distribute App** to upload to App Store Connect / TestFlight.

### Android (Google Play)
1. Run `npx cap open android` to open the workspace in **Android Studio**.
2. Go to **Build > Generate Signed Bundle / APK**.
3. Choose **Android App Bundle** (required for Google Play).
4. Create or select your upload key keystore.
5. Build the release bundle and upload the generated `.aab` file to the Google Play Console.
