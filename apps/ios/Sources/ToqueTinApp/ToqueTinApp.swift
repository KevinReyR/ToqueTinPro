import SwiftUI
import TrackingUI

@main
struct ToqueTinApp: App {
    @StateObject private var model = TrackingModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                if let snapshot = model.snapshot {
                    TrackingScreen(snapshot: snapshot, isConnected: model.isConnected)
                } else if let error = model.errorMessage {
                    TrackingErrorView(message: error)
                } else {
                    TrackingWelcomeView()
                }
            }
            .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                guard let url = activity.webpageURL else { return }
                Task { await model.open(url) }
            }
            .onOpenURL { url in Task { await model.open(url) } }
            .onChange(of: scenePhase) { phase in
                guard phase == .active else { return }
                Task { await model.refresh() }
            }
        }
    }
}

private struct TrackingWelcomeView: View {
    var body: some View {
        ZStack {
            TrackingPalette.background.ignoresSafeArea()

            Circle()
                .fill(TrackingPalette.orange.opacity(0.12))
                .frame(width: 330, height: 330)
                .offset(x: 150, y: -310)

            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    brand.padding(.bottom, 48)
                    scannerIllustration.padding(.bottom, 34)

                    Text("Tu pedido,\nsiempre a la vista")
                        .font(.system(size: 39, weight: .bold, design: .rounded))
                        .tracking(-1.2)
                        .multilineTextAlignment(.center)

                    Text("Escanea el código QR de tu pedido para seguir su preparación en tiempo real.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .lineSpacing(3)
                        .padding(.top, 14)
                        .padding(.horizontal, 18)

                    steps.padding(.top, 38)
                }
                .padding(.horizontal, 24)
                .padding(.top, 22)
                .padding(.bottom, 34)
            }
        }
    }

    private var brand: some View {
        HStack(spacing: 11) {
            ZStack {
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .fill(TrackingPalette.ink)
                Image(systemName: "takeoutbag.and.cup.and.straw.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .frame(width: 42, height: 42)

            Text("TOQUETIN")
                .font(.subheadline.weight(.black))
                .tracking(2)

            Spacer()
        }
    }

    private var scannerIllustration: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 38, style: .continuous)
                .fill(TrackingPalette.ink)
                .frame(width: 226, height: 226)
                .shadow(color: TrackingPalette.ink.opacity(0.2), radius: 25, y: 15)

            Circle()
                .fill(TrackingPalette.orange)
                .frame(width: 116, height: 116)

            Image(systemName: "qrcode.viewfinder")
                .font(.system(size: 66, weight: .medium))
                .foregroundStyle(.white)
        }
    }

    private var steps: some View {
        HStack(spacing: 8) {
            welcomeStep(icon: "camera.fill", text: "Escanea")
            connector
            welcomeStep(icon: "fork.knife", text: "Espera")
            connector
            welcomeStep(icon: "takeoutbag.and.cup.and.straw.fill", text: "Recoge")
        }
        .padding(18)
        .background(.white.opacity(0.84), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func welcomeStep(icon: String, text: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(TrackingPalette.orange)
            Text(text)
                .font(.caption.weight(.semibold))
        }
        .frame(maxWidth: .infinity)
    }

    private var connector: some View {
        Capsule()
            .fill(Color.secondary.opacity(0.2))
            .frame(width: 18, height: 2)
    }
}

private struct TrackingErrorView: View {
    let message: String

    var body: some View {
        ZStack {
            TrackingPalette.background.ignoresSafeArea()

            VStack(spacing: 20) {
                ZStack {
                    Circle().fill(Color.red.opacity(0.1))
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 42, weight: .semibold))
                        .foregroundStyle(.red)
                }
                .frame(width: 96, height: 96)

                Text("No pudimos abrir el pedido")
                    .font(.title2.bold())
                    .multilineTextAlignment(.center)

                Text(message)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Text("Comprueba el enlace o vuelve a escanear el código QR.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.top, 6)
            }
            .padding(30)
        }
    }
}
