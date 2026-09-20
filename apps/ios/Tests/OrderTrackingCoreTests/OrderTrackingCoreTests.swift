import Foundation
import OrderTrackingCore
import Testing

@Test func `tracking link reads nonce and secret from fragment`() throws {
    let url = try #require(URL(string: "https://track.example.com/tracking/83555298-1a4e-40bd-bce2-c8484aaac062#v1.secret.signature"))
    let link = try #require(TrackingLink(url: url))
    #expect(link.nonce.uuidString.lowercased() == "83555298-1a4e-40bd-bce2-c8484aaac062")
    #expect(link.token == "v1.secret.signature")
}

@Test func `tracking link accepts ToqueTin custom scheme`() throws {
    let url = try #require(URL(string: "toquetin://tracking/83555298-1a4e-40bd-bce2-c8484aaac062#v1.secret.signature"))
    let link = try #require(TrackingLink(url: url))
    #expect(link.nonce.uuidString.lowercased() == "83555298-1a4e-40bd-bce2-c8484aaac062")
    #expect(link.token == "v1.secret.signature")
}

@Test func `tracking link rejects unsupported schemes and malformed routes`() throws {
    #expect(TrackingLink(url: try #require(URL(string: "http://example.com/tracking/83555298-1a4e-40bd-bce2-c8484aaac062#token"))) == nil)
    #expect(TrackingLink(url: try #require(URL(string: "toquetin://other/83555298-1a4e-40bd-bce2-c8484aaac062#token"))) == nil)
    #expect(TrackingLink(url: try #require(URL(string: "toquetin://tracking/not-a-uuid#token"))) == nil)
}

@Test func `expired estimate says almost ready`() {
    let now = Date(timeIntervalSince1970: 1000)
    let snapshot = OrderSnapshot(
        restaurantName: "Cocina La Esquina", orderNumber: "143", status: .preparing,
        estimatedReadyAt: Date(timeIntervalSince1970: 900), estimateUpdatedAt: now,
        pickupInstructions: nil, cancellationReason: nil, serverTime: now,
        version: 2, activityExpiresAt: nil, lastUpdatedAt: now
    )
    #expect(snapshot.etaLabel(at: now) == "Casi listo")
}
