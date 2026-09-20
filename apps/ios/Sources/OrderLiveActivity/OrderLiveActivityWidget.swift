import ActivityKit
import OrderTrackingCore
import SwiftUI
import WidgetKit

@main
struct OrderLiveActivityBundle: WidgetBundle {
    var body: some Widget { OrderLiveActivityWidget() }
}

struct OrderLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: OrderActivityAttributes.self) { context in
            VStack(alignment: .leading, spacing: 10) {
                HStack { Text(context.attributes.restaurantName).font(.caption).foregroundStyle(.secondary); Spacer(); Text("Pedido \(context.attributes.orderNumber)").font(.caption.monospacedDigit()) }
                Text(context.state.status.title).font(.title2.weight(.bold))
                EtaView(state: context.state)
                HStack(spacing: 5) { ForEach(1...4, id: \.self) { step in Capsule().fill(step <= context.state.status.step ? Color.orange : Color.secondary.opacity(0.2)).frame(height: 4) } }
            }
            .padding(.vertical, 4)
            .activityBackgroundTint(Color(red: 0.96, green: 0.93, blue: 0.88))
            .activitySystemActionForegroundColor(.primary)
            .widgetURL(URL(string: "https://toquetinpro-web.onrender.com/tracking/\(context.attributes.publicNonce.uuidString.lowercased())"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Label("#\(context.attributes.orderNumber)", systemImage: "takeoutbag.and.cup.and.straw.fill").fontWeight(.semibold) }
                DynamicIslandExpandedRegion(.trailing) { EtaView(state: context.state).foregroundStyle(.orange) }
                DynamicIslandExpandedRegion(.bottom) { Text(context.state.status.title).frame(maxWidth: .infinity, alignment: .leading) }
            } compactLeading: {
                Text("#\(context.attributes.orderNumber)").font(.caption2.bold()).monospacedDigit()
            } compactTrailing: {
                EtaView(state: context.state).font(.caption2).foregroundStyle(.orange)
            } minimal: {
                Image(systemName: context.state.status == .ready ? "checkmark" : "takeoutbag.and.cup.and.straw.fill")
            }
            .widgetURL(URL(string: "https://toquetinpro-web.onrender.com/tracking/\(context.attributes.publicNonce.uuidString.lowercased())"))
            .keylineTint(.orange)
        }
    }
}

private struct EtaView: View {
    let state: OrderActivityAttributes.ContentState
    var body: some View {
        if state.status == .ready { Text("Listo para recoger").fontWeight(.semibold) }
        else if let date = state.estimatedReadyAt, date > .now { Text(timerInterval: .now...date, countsDown: true).monospacedDigit() }
        else if state.status == .received || state.status == .preparing { Text("Casi listo").fontWeight(.semibold) }
        else { Text(state.status.title) }
    }
}
