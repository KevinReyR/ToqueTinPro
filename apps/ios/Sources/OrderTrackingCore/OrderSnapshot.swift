import Foundation

public enum OrderStatus: String, Codable, Sendable {
    case received = "RECEIVED"
    case preparing = "PREPARING"
    case ready = "READY"
    case delivered = "DELIVERED"
    case cancelled = "CANCELLED"

    public var title: String {
        switch self {
        case .received: "Recibido"
        case .preparing: "Preparando"
        case .ready: "Listo para recoger"
        case .delivered: "Entregado"
        case .cancelled: "Cancelado"
        }
    }

    public var step: Int {
        switch self {
        case .received: 1
        case .preparing: 2
        case .ready: 3
        case .delivered: 4
        case .cancelled: 0
        }
    }
}

public struct OrderSnapshot: Codable, Hashable, Sendable {
    public let restaurantName: String
    public let orderNumber: String
    public let status: OrderStatus
    public let estimatedReadyAt: Date?
    public let estimateUpdatedAt: Date?
    public let pickupInstructions: String?
    public let cancellationReason: String?
    public let serverTime: Date
    public let version: Int
    public let activityExpiresAt: Date?
    public let lastUpdatedAt: Date

    public init(
        restaurantName: String,
        orderNumber: String,
        status: OrderStatus,
        estimatedReadyAt: Date?,
        estimateUpdatedAt: Date?,
        pickupInstructions: String?,
        cancellationReason: String?,
        serverTime: Date,
        version: Int,
        activityExpiresAt: Date?,
        lastUpdatedAt: Date
    ) {
        self.restaurantName = restaurantName
        self.orderNumber = orderNumber
        self.status = status
        self.estimatedReadyAt = estimatedReadyAt
        self.estimateUpdatedAt = estimateUpdatedAt
        self.pickupInstructions = pickupInstructions
        self.cancellationReason = cancellationReason
        self.serverTime = serverTime
        self.version = version
        self.activityExpiresAt = activityExpiresAt
        self.lastUpdatedAt = lastUpdatedAt
    }

    public var activityState: OrderActivityAttributes.ContentState {
        .init(status: status, estimatedReadyAt: estimatedReadyAt, version: version)
    }

    public func etaLabel(at date: Date = .now) -> String {
        switch status {
        case .ready: return "Listo para recoger"
        case .delivered: return "Pedido entregado"
        case .cancelled: return "Pedido cancelado"
        case .received, .preparing:
            guard let estimatedReadyAt else { return "Calculando tiempo" }
            let minutes = Int(ceil(estimatedReadyAt.timeIntervalSince(date) / 60))
            return minutes > 0 ? "~\(minutes) min" : "Casi listo"
        }
    }
}
