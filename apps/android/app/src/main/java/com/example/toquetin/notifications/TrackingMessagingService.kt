package com.reinovalabs.toquetin.notifications

import com.reinovalabs.toquetin.model.OrderSnapshot
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.serialization.json.Json

class TrackingMessagingService : FirebaseMessagingService() {
    private val json = Json { ignoreUnknownKeys = true }

    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data["revoked"] == "true") {
            TrackingNotifications.dismiss(this)
            return
        }
        val snapshotJson = message.data["snapshot"] ?: return
        runCatching { json.decodeFromString<OrderSnapshot>(snapshotJson) }
            .onSuccess { TrackingNotifications.show(this, it) }
    }
}
