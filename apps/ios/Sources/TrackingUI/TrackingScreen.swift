import OrderTrackingCore
import SwiftUI

public struct TrackingScreen: View {
    public let snapshot: OrderSnapshot
    public let isConnected: Bool

    public init(snapshot: OrderSnapshot, isConnected: Bool = true) {
        self.snapshot = snapshot
        self.isConnected = isConnected
    }

    public var body: some View {
        ZStack {
            TrackingPalette.background.ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(spacing: 22) {
                    brandHeader
                    statusCard
                    progressCard

                    if let instructions = snapshot.pickupInstructions, !instructions.isEmpty {
                        informationCard(
                            title: "Al recoger",
                            message: instructions,
                            icon: "takeoutbag.and.cup.and.straw.fill",
                            tint: TrackingPalette.orange
                        )
                    }

                    if let reason = snapshot.cancellationReason, snapshot.status == .cancelled {
                        informationCard(
                            title: "Información del pedido",
                            message: reason,
                            icon: "exclamationmark.triangle.fill",
                            tint: .red
                        )
                    }

                    liveActivityNote
                    updatedLabel
                }
                .padding(.horizontal, 20)
                .padding(.top, 14)
                .padding(.bottom, 32)
            }
        }
    }

    private var brandHeader: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(TrackingPalette.ink)
                Image(systemName: "takeoutbag.and.cup.and.straw.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 2) {
                Text("TOQUETIN")
                    .font(.caption.weight(.black))
                    .tracking(1.7)
                Text(snapshot.restaurantName)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            HStack(spacing: 6) {
                Circle()
                    .fill(connectionColor)
                    .frame(width: 7, height: 7)
                Text(isConnected ? "EN VIVO" : "RECONECTANDO")
                    .font(.caption2.weight(.bold))
                    .tracking(0.7)
            }
            .padding(.horizontal, 11)
            .padding(.vertical, 8)
            .background(.white.opacity(0.85), in: Capsule())
        }
    }

    private var statusCard: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("TU PEDIDO")
                        .font(.caption2.weight(.bold))
                        .tracking(1.2)
                        .foregroundStyle(.white.opacity(0.68))
                    Text("#\(snapshot.orderNumber)")
                        .font(.title3.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                }

                Spacer()

                Image(systemName: statusIcon)
                    .font(.system(size: 25, weight: .semibold))
                    .foregroundStyle(TrackingPalette.orange)
                    .frame(width: 52, height: 52)
                    .background(.white.opacity(0.1), in: Circle())
            }

            VStack(alignment: .leading, spacing: 7) {
                Text(snapshot.status.title)
                    .font(.system(size: 38, weight: .bold, design: .rounded))
                    .tracking(-1.2)
                    .foregroundStyle(.white)
                    .minimumScaleFactor(0.72)

                TimelineView(.periodic(from: .now, by: 30)) { context in
                    Text(snapshot.etaLabel(at: context.date))
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(TrackingPalette.orange)
                }
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            ZStack(alignment: .topTrailing) {
                RoundedRectangle(cornerRadius: 30, style: .continuous)
                    .fill(TrackingPalette.ink)
                Circle()
                    .fill(TrackingPalette.orange.opacity(0.16))
                    .frame(width: 190, height: 190)
                    .offset(x: 70, y: -95)
            }
            .clipped()
        )
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .shadow(color: TrackingPalette.ink.opacity(0.16), radius: 22, y: 12)
    }

    private var progressCard: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Progreso del pedido")
                .font(.headline)

            VStack(spacing: 0) {
                ForEach(Array(progressSteps.enumerated()), id: \.offset) { index, step in
                    HStack(alignment: .top, spacing: 15) {
                        VStack(spacing: 0) {
                            ZStack {
                                Circle().fill(stepState(index + 1).background)
                                Image(systemName: stepState(index + 1).icon)
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundStyle(stepState(index + 1).foreground)
                            }
                            .frame(width: 32, height: 32)

                            if index < progressSteps.count - 1 {
                                Rectangle()
                                    .fill(index + 1 < snapshot.status.step ? TrackingPalette.orange : Color.secondary.opacity(0.16))
                                    .frame(width: 2, height: 30)
                            }
                        }

                        VStack(alignment: .leading, spacing: 3) {
                            Text(step.title)
                                .font(.subheadline.weight(index + 1 == snapshot.status.step ? .bold : .semibold))
                                .foregroundStyle(index + 1 <= snapshot.status.step ? TrackingPalette.ink : .secondary)
                            Text(step.subtitle)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.top, 2)

                        Spacer()
                    }
                }
            }
        }
        .padding(22)
        .background(.white.opacity(0.92), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(.white, lineWidth: 1)
        }
    }

    private func informationCard(title: String, message: String, icon: String, tint: Color) -> some View {
        HStack(alignment: .top, spacing: 15) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 42, height: 42)
                .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 13, style: .continuous))

            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.subheadline.weight(.bold))
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(18)
        .background(.white.opacity(0.88), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var liveActivityNote: some View {
        HStack(spacing: 12) {
            Image(systemName: "wave.3.right.circle.fill")
                .font(.title2)
                .foregroundStyle(.green)
            VStack(alignment: .leading, spacing: 2) {
                Text("Seguimiento activado")
                    .font(.footnote.weight(.bold))
                Text("También puedes verlo en la pantalla bloqueada.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.horizontal, 4)
    }

    private var updatedLabel: some View {
        HStack(spacing: 5) {
            Image(systemName: "arrow.clockwise")
            Text("Actualizado")
            Text(snapshot.lastUpdatedAt, style: .relative)
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
    }

    private var statusIcon: String {
        switch snapshot.status {
        case .received: "checkmark.seal.fill"
        case .preparing: "flame.fill"
        case .ready: "bell.badge.fill"
        case .delivered: "hand.thumbsup.fill"
        case .cancelled: "xmark.octagon.fill"
        }
    }

    private var connectionColor: Color {
        if !isConnected { return .orange }
        return snapshot.status == .cancelled ? .red : .green
    }

    private var progressSteps: [(title: String, subtitle: String)] {
        [
            ("Pedido recibido", "El restaurante confirmó tu pedido"),
            ("En preparación", "La cocina está trabajando en él"),
            ("Listo para recoger", "Acércate al punto de entrega"),
            ("Entregado", "¡Que lo disfrutes!")
        ]
    }

    private func stepState(_ step: Int) -> (background: Color, foreground: Color, icon: String) {
        if snapshot.status == .cancelled {
            return (Color.secondary.opacity(0.12), .secondary, "minus")
        }
        if step < snapshot.status.step {
            return (TrackingPalette.orange, .white, "checkmark")
        }
        if step == snapshot.status.step {
            return (TrackingPalette.ink, .white, "circle.fill")
        }
        return (Color.secondary.opacity(0.12), .secondary, "circle")
    }
}

public enum TrackingPalette {
    public static let background = Color(red: 0.965, green: 0.953, blue: 0.925)
    public static let ink = Color(red: 0.105, green: 0.11, blue: 0.12)
    public static let orange = Color(red: 1.0, green: 0.49, blue: 0.16)
}
