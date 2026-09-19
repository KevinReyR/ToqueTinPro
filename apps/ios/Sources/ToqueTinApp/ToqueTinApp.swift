import SwiftUI
import TrackingUI

@main
struct ToqueTinApp: App {
    @StateObject private var model = TrackingModel()

    var body: some Scene {
        WindowGroup {
            Group {
                if let snapshot = model.snapshot {
                    TrackingScreen(snapshot: snapshot)
                } else if let error = model.errorMessage {
                    VStack(spacing: 18) { Image(systemName: "qrcode").font(.largeTitle); Text(error).multilineTextAlignment(.center) }.padding(28)
                } else {
                    VStack(spacing: 18) {
                        Image(systemName: "qrcode.viewfinder").font(.system(size: 52))
                        Text("Escanea el QR de tu pedido").font(.title2.bold())
                        Text("La app completa es opcional. El QR también abre ToqueTin sin instalarla.").foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }.padding(28)
                }
            }
            .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                guard let url = activity.webpageURL else { return }
                Task { await model.open(url) }
            }
            .onOpenURL { url in Task { await model.open(url) } }
        }
    }
}
