import Foundation

public struct TrackingLink: Equatable, Sendable {
    public let nonce: UUID
    public let token: String

    public init?(url: URL) {
        let components = url.pathComponents
        guard let trackingIndex = components.firstIndex(of: "tracking"),
              components.indices.contains(trackingIndex + 1),
              let nonce = UUID(uuidString: components[trackingIndex + 1]),
              let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?.fragment,
              !token.isEmpty else { return nil }
        self.nonce = nonce
        self.token = token
    }
}
