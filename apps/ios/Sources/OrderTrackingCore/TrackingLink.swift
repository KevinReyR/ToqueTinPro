import Foundation

public struct TrackingLink: Equatable, Sendable {
    public let nonce: UUID
    public let token: String

    public init?(url: URL) {
        let components = url.pathComponents.filter { $0 != "/" }
        let nonceValue: String?

        switch url.scheme?.lowercased() {
        case "toquetin":
            guard url.host?.lowercased() == "tracking" else { return nil }
            nonceValue = components.first
        case "https":
            guard components.count == 2, components[0] == "tracking" else { return nil }
            nonceValue = components[1]
        default:
            return nil
        }

        guard let nonceValue,
              let nonce = UUID(uuidString: nonceValue),
              let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?.fragment,
              !token.isEmpty else { return nil }
        self.nonce = nonce
        self.token = token
    }
}
