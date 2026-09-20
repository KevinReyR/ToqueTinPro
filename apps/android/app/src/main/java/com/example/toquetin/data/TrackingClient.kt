package com.reinovalabs.toquetin.data

import com.reinovalabs.toquetin.BuildConfig
import com.reinovalabs.toquetin.model.OrderSnapshot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.UUID

data class TrackingLink(val nonce: UUID, val token: String) {
    companion object {
        fun parse(uri: URI): TrackingLink? {
            val parts = uri.path.split('/').filter(String::isNotBlank)
            val index = parts.indexOf("tracking")
            if (index < 0 || index + 1 >= parts.size || uri.fragment.isNullOrBlank()) return null
            return runCatching { TrackingLink(UUID.fromString(parts[index + 1]), uri.fragment) }.getOrNull()
        }
    }
}

class TrackingClient(private val baseUrl: String = BuildConfig.TRACKING_BASE_URL) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun open(link: TrackingLink): OrderSnapshot = withContext(Dispatchers.IO) {
        val body = buildJsonObject { put("nonce", link.nonce.toString()); put("token", link.token) }.toString()
        val exchangeResponse = request("/api/tracking/exchange", "POST", body)
        try {
            if (exchangeResponse.responseCode !in 200..299) error("TRACKING_INVALID")
        } finally {
            exchangeResponse.disconnect()
        }

        val snapshotResponse = request("/api/tracking/${link.nonce}", "GET")
        try {
            if (snapshotResponse.responseCode !in 200..299) error("TRACKING_INVALID")
            json.decodeFromString<OrderSnapshot>(snapshotResponse.inputStream.bufferedReader().use { it.readText() })
        } finally {
            snapshotResponse.disconnect()
        }
    }

    suspend fun registerFcmToken(link: TrackingLink, token: String): Unit = withContext(Dispatchers.IO) {
        val payload = buildJsonObject {
            put("nonce", link.nonce.toString()); put("channel", "FCM_LIVE_UPDATE"); put("token", token)
            put("capabilities", buildJsonObject { put("liveUpdate", true) })
        }.toString()
        val response = request("/api/delivery-channels", "POST", payload)
        try {
            if (response.responseCode !in 200..299) error("DELIVERY_REGISTRATION_FAILED")
        } finally {
            response.disconnect()
        }
    }

    private fun request(path: String, method: String, body: String? = null): HttpURLConnection =
        (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method; connectTimeout = 10_000; readTimeout = 10_000
            setRequestProperty("Accept", "application/json")
            if (body != null) { doOutput = true; setRequestProperty("Content-Type", "application/json"); outputStream.use { it.write(body.toByteArray()) } }
        }
}
