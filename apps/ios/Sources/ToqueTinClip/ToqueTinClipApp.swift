import OrderTrackingCore
import SwiftUI
import TrackingUI

@main
struct ToqueTinClipApp: App {
    @StateObject private var model = TrackingModel()

    var body: some Scene {
        WindowGroup {
            Group {
                if let snapshot = model.snapshot { TrackingScreen(snapshot: snapshot) }
                else if let message = model.errorMessage {
                    VStack(spacing: 16) {
                        Image(systemName: "qrcode").font(.largeTitle)
                        Text("Seguimiento no disponible").font(.title2.bold())
                        Text(message).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }.padding(24)
                }
                else { ProgressView("Abriendo tu pedido…") }
            }
            .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                guard let url = activity.webpageURL else { return }
                Task { await model.open(url) }
            }
            .onOpenURL { url in Task { await model.open(url) } }
        }
    }
}
