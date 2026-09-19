import Combine
import Foundation
import OrderTrackingCore

@MainActor
public final class TrackingModel: ObservableObject {
    @Published public private(set) var snapshot: OrderSnapshot?
    @Published public private(set) var errorMessage: String?
    private let activityManager = LiveActivityManager()

    public init() {}

    public func open(_ url: URL) async {
        guard let link = TrackingLink(url: url),
              let baseURL = Bundle.main.object(forInfoDictionaryKey: "TRACKING_BASE_URL") as? String,
              let apiURL = URL(string: baseURL) else {
            errorMessage = TrackingAPIError.invalidLink.localizedDescription
            return
        }
        let api = TrackingAPIClient(baseURL: apiURL)
        do {
            try await api.exchange(link)
            let current = try await api.snapshot(nonce: link.nonce)
            snapshot = current
            try await activityManager.start(snapshot: current, nonce: link.nonce, api: api)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
