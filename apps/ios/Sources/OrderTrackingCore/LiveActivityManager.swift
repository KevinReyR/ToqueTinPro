import ActivityKit
import Foundation
import os

@MainActor
public final class LiveActivityManager {
    private let logger = Logger(subsystem: "com.toquetin.app", category: "live-activity")

    public init() {}

    public func start(snapshot: OrderSnapshot, nonce: UUID, api: TrackingAPIClient) async throws {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        if let existing = Activity<OrderActivityAttributes>.activities.first(where: { $0.attributes.publicNonce == nonce }) {
            await update(existing, snapshot: snapshot)
            return
        }
        let attributes = OrderActivityAttributes(restaurantName: snapshot.restaurantName, orderNumber: snapshot.orderNumber, publicNonce: nonce)
        let activity: Activity<OrderActivityAttributes>
        if #available(iOS 16.2, *) {
            activity = try Activity.request(attributes: attributes, content: ActivityContent(state: snapshot.activityState, staleDate: snapshot.estimatedReadyAt), pushType: .token)
        } else {
            activity = try Activity.request(attributes: attributes, contentState: snapshot.activityState, pushType: .token)
        }
        Task {
            for await token in activity.pushTokenUpdates {
                do { try await api.registerLiveActivityToken(token, nonce: nonce) }
                catch { logger.error("Live Activity token registration failed: \(error.localizedDescription, privacy: .public)") }
            }
        }
    }

    public func apply(snapshot: OrderSnapshot, nonce: UUID) async {
        guard let activity = Activity<OrderActivityAttributes>.activities.first(where: { $0.attributes.publicNonce == nonce }) else { return }
        switch snapshot.status {
        case .delivered, .cancelled:
            if #available(iOS 16.2, *) {
                await activity.end(ActivityContent(state: snapshot.activityState, staleDate: snapshot.estimatedReadyAt), dismissalPolicy: .after(.now.addingTimeInterval(15 * 60)))
            } else {
                await activity.end(using: snapshot.activityState, dismissalPolicy: .after(.now.addingTimeInterval(15 * 60)))
            }
        case .received, .preparing, .ready:
            await update(activity, snapshot: snapshot)
        }
    }

    public func revoke(nonce: UUID) async {
        guard let activity = Activity<OrderActivityAttributes>.activities.first(where: { $0.attributes.publicNonce == nonce }) else { return }
        await activity.end(nil, dismissalPolicy: .immediate)
    }

    private func update(_ activity: Activity<OrderActivityAttributes>, snapshot: OrderSnapshot) async {
        if #available(iOS 16.2, *) {
            await activity.update(ActivityContent(state: snapshot.activityState, staleDate: snapshot.estimatedReadyAt))
        } else {
            await activity.update(using: snapshot.activityState)
        }
    }
}
