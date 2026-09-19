import OrderTrackingCore
import SwiftUI

public struct TrackingScreen: View {
    public let snapshot: OrderSnapshot

    public init(snapshot: OrderSnapshot) { self.snapshot = snapshot }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack {
                    Label("ToqueTin", systemImage: "circle.hexagongrid.fill").fontWeight(.semibold)
                    Spacer()
                    Label("En vivo", systemImage: "circle.fill").font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 24)
                Text(snapshot.restaurantName.uppercased()).font(.caption.weight(.bold)).tracking(1.4).foregroundStyle(.orange)
                Text("Pedido \(snapshot.orderNumber)").font(.headline).foregroundStyle(.secondary)
                Text(snapshot.status.title).font(.system(size: 52, weight: .bold, design: .rounded)).tracking(-2.2)
                Text(snapshot.etaLabel()).font(.title3.weight(.semibold)).foregroundStyle(.orange)
                progress
                if let instructions = snapshot.pickupInstructions {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Al recoger").font(.caption).foregroundStyle(.secondary)
                        Text(instructions)
                    }
                    .padding()
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
                Label("Visible en tu pantalla bloqueada", systemImage: "dot.radiowaves.left.and.right")
                    .font(.footnote.weight(.medium)).foregroundStyle(.green)
            }
            .padding(24)
        }
        .background(Color(red: 0.95, green: 0.93, blue: 0.89).ignoresSafeArea())
    }

    private var progress: some View {
        HStack(spacing: 6) {
            ForEach(1...4, id: \.self) { step in
                Capsule().fill(step <= snapshot.status.step ? Color.orange : Color.secondary.opacity(0.2)).frame(height: 5)
            }
        }
        .accessibilityLabel("Etapa \(snapshot.status.step) de 4")
    }
}
