import Combine
import Foundation
import OrderTrackingCore

@MainActor
public final class TrackingModel: ObservableObject {
    @Published public private(set) var snapshot: OrderSnapshot?
    @Published public private(set) var errorMessage: String?
    @Published public private(set) var isConnected = true
    private let activityManager = LiveActivityManager()
    private var api: TrackingAPIClient?
    private var nonce: UUID?
    private var refreshTask: Task<Void, Never>?

    public init() {}

    public func open(_ url: URL) async {
        refreshTask?.cancel()
        errorMessage = nil

        guard let link = TrackingLink(url: url),
              let baseURL = Bundle.main.object(forInfoDictionaryKey: "TRACKING_BASE_URL") as? String,
              let apiURL = URL(string: baseURL) else {
            errorMessage = TrackingAPIError.invalidLink.localizedDescription
            return
        }
        let client = TrackingAPIClient(baseURL: apiURL)
        do {
            try await client.exchange(link)
            let current = try await client.snapshot(nonce: link.nonce)
            snapshot = current
            isConnected = true
            api = client
            nonce = link.nonce

            do {
                try await activityManager.start(snapshot: current, nonce: link.nonce, api: client)
            } catch {
                // Tracking remains available even when Live Activities are unavailable.
            }
            startRefreshing()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func refresh() async {
        guard let api, let nonce else { return }
        do {
            let current = try await api.snapshot(nonce: nonce)
            isConnected = true
            guard current.version >= (snapshot?.version ?? 0) else { return }
            snapshot = current
            await activityManager.apply(snapshot: current, nonce: nonce)
        } catch {
            isConnected = false
        }
    }

    private func startRefreshing() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    try await Task.sleep(nanoseconds: 10_000_000_000)
                } catch {
                    return
                }
                await self?.refresh()
            }
        }
    }
}
