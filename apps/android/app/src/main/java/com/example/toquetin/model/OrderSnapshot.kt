package com.reinovalabs.toquetin.model

import kotlinx.serialization.Serializable
import java.time.Instant
import kotlin.math.ceil

@Serializable
enum class OrderStatus { RECEIVED, PREPARING, READY, DELIVERED, CANCELLED }

@Serializable
data class OrderSnapshot(
    val restaurantName: String,
    val orderNumber: String,
    val status: OrderStatus,
    val estimatedReadyAt: String? = null,
    val estimateUpdatedAt: String? = null,
    val pickupInstructions: String? = null,
    val cancellationReason: String? = null,
    val serverTime: String,
    val version: Int,
    val activityExpiresAt: String? = null,
    val lastUpdatedAt: String,
) {
    fun statusLabel(): String = when (status) {
        OrderStatus.RECEIVED -> "Recibido"
        OrderStatus.PREPARING -> "Preparando"
        OrderStatus.READY -> "Listo para recoger"
        OrderStatus.DELIVERED -> "Entregado"
        OrderStatus.CANCELLED -> "Cancelado"
    }

    fun etaLabel(now: Instant = Instant.now()): String = when (status) {
        OrderStatus.READY -> "Listo para recoger"
        OrderStatus.DELIVERED -> "Pedido entregado"
        OrderStatus.CANCELLED -> "Pedido cancelado"
        else -> estimatedReadyAt?.let {
            val minutes = ceil((Instant.parse(it).toEpochMilli() - now.toEpochMilli()) / 60_000.0).toInt()
            if (minutes > 0) "~$minutes min" else "Casi listo"
        } ?: "Calculando tiempo"
    }

    fun step(): Int = when (status) {
        OrderStatus.RECEIVED -> 1
        OrderStatus.PREPARING -> 2
        OrderStatus.READY -> 3
        OrderStatus.DELIVERED -> 4
        OrderStatus.CANCELLED -> 0
    }
}
