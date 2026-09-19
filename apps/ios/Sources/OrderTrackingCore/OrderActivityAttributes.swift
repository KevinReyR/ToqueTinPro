import ActivityKit
import Foundation

public struct OrderActivityAttributes: ActivityAttributes, Sendable {
    public struct ContentState: Codable, Hashable, Sendable {
        public let status: OrderStatus
        public let estimatedReadyAt: Date?
        public let version: Int

        public init(status: OrderStatus, estimatedReadyAt: Date?, version: Int) {
            self.status = status
            self.estimatedReadyAt = estimatedReadyAt
            self.version = version
        }
    }

    public let restaurantName: String
    public let orderNumber: String
    public let publicNonce: UUID

    public init(restaurantName: String, orderNumber: String, publicNonce: UUID) {
        self.restaurantName = restaurantName
        self.orderNumber = orderNumber
        self.publicNonce = publicNonce
    }
}
