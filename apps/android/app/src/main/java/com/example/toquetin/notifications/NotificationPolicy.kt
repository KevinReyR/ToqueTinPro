package com.reinovalabs.toquetin.notifications

import com.reinovalabs.toquetin.model.OrderStatus

object NotificationPolicy {
    const val GENERAL_CHANNEL_ID = "order_tracking_alerts_v2"
    const val READY_CHANNEL_ID = "order_ready_alerts_v2"

    val GENERAL_VIBRATION_PATTERN = longArrayOf(0L, 300L)
    val READY_VIBRATION_PATTERN = longArrayOf(0L, 700L, 250L, 700L, 250L, 700L)

    fun channelId(status: OrderStatus): String =
        if (status == OrderStatus.READY) READY_CHANNEL_ID else GENERAL_CHANNEL_ID

    fun shouldAlert(eventKind: String?): Boolean = eventKind in setOf(
        "TRACKING_STARTED",
        "STATUS_CHANGED",
        "ORDER_READY",
        "ORDER_CLOSED",
    )
}
