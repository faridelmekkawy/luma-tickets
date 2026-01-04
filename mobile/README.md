# Luma Usher Mobile Setup

This folder contains the Capacitor scaffolding and native scanner plugins.

## iOS setup (required)

1. Install dependencies:
   ```bash
   cd mobile
   npm install
   ```
2. Sync web assets and add the iOS platform:
   ```bash
   npm run cap:sync
   npx cap add ios
   ```
3. Register the native scanner plugin in `ios/App/App/AppDelegate.swift`:
   ```swift
   import Capacitor

   @UIApplicationMain
   class AppDelegate: UIResponder, UIApplicationDelegate {
     var window: UIWindow?

     func application(
       _ application: UIApplication,
       didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
     ) -> Bool {
       let bridge = CAPBridgeViewController()
       bridge.registerPlugin(LumaNativeScannerPlugin.self)
       window = UIWindow(frame: UIScreen.main.bounds)
       window?.rootViewController = bridge
       window?.makeKeyAndVisible()
       return true
     }
   }
   ```
4. Add the camera usage description in `ios/App/App/Info.plist`:
   ```xml
   <key>NSCameraUsageDescription</key>
   <string>Camera access is required to scan tickets.</string>
   ```
5. Open Xcode and run:
   ```bash
   npm run cap:ios
   ```

## Scanner integration in the web app

The web app listens for scan events via `window.Capacitor.Plugins.LumaNativeScanner` and
calls `startScan()` when the operator taps the **Scan** button.

To force iOS scanning mode, launch the app with `?scan=hardware` in the URL.
