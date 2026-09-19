package com.example.toquetin.model

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

class OrderSnapshotTest {
    @Test fun overdueEstimateNeverBecomesNegative() {
        val now = Instant.parse("2026-09-19T17:00:00Z")
        val snapshot = OrderSnapshot("Cocina La Esquina", "143", OrderStatus.PREPARING, "2026-09-19T16:59:00Z", serverTime = now.toString(), version = 2, lastUpdatedAt = now.toString())
        assertEquals("Casi listo", snapshot.etaLabel(now))
    }

    @Test fun readyStateReplacesEstimate() {
        val now = Instant.parse("2026-09-19T17:00:00Z")
        val snapshot = OrderSnapshot("Cocina La Esquina", "143", OrderStatus.READY, "2026-09-19T17:10:00Z", serverTime = now.toString(), version = 3, lastUpdatedAt = now.toString())
        assertEquals("Listo para recoger", snapshot.etaLabel(now))
    }
}
