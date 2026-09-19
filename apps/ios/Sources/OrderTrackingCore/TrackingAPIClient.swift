import Foundation

public enum TrackingAPIError: Error, LocalizedError {
    case invalidLink
    case invalidResponse
    case rejected

    public var errorDescription: String? {
        switch self {
        case .invalidLink: "El enlace del pedido no es válido."
        case .invalidResponse: "No pudimos leer el estado del pedido."
        case .rejected: "Este seguimiento ya no está disponible."
        }
    }
}

public struct TrackingAPIClient: Sendable {
    private let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder
    }

    public func exchange(_ link: TrackingLink) async throws {
        let url = baseURL.appending(path: "api/tracking/exchange")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(ExchangeBody(nonce: link.nonce, token: link.token))
        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw TrackingAPIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw TrackingAPIError.rejected }
    }

    public func snapshot(nonce: UUID) async throws -> OrderSnapshot {
        let url = baseURL.appending(path: "api/tracking/\(nonce.uuidString.lowercased())")
        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw TrackingAPIError.rejected
        }
        return try decoder.decode(OrderSnapshot.self, from: data)
    }

    public func registerLiveActivityToken(_ token: Data, nonce: UUID) async throws {
        let value = token.map { String(format: "%02x", $0) }.joined()
        let url = baseURL.appending(path: "api/delivery-channels")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(ChannelBody(nonce: nonce, channel: "APNS_LIVE_ACTIVITY", token: value, capabilities: ["liveActivity": true]))
        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw TrackingAPIError.rejected
        }
    }
}

private struct ExchangeBody: Encodable {
    let nonce: UUID
    let token: String
}

private struct ChannelBody: Encodable {
    let nonce: UUID
    let channel: String
    let token: String
    let capabilities: [String: Bool]
}
