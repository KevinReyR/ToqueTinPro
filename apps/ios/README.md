# ToqueTin para iOS

El proyecto contiene tres superficies: una app contenedora mínima, el App Clip y la extensión de Live Activity. `project.yml` genera el proyecto Xcode con [XcodeGen](https://github.com/yonaskolb/XcodeGen).

En macOS:

```bash
brew install xcodegen
cd apps/ios
xcodegen generate
open ToqueTin.xcodeproj
```

Antes de firmar, reemplaza el equipo y los bundle identifiers, configura `TRACKING_BASE_URL`, crea la experiencia avanzada del App Clip y habilita Push Notifications/Live Activities en App Store Connect.
