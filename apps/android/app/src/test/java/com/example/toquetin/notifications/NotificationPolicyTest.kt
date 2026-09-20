package com.reinovalabs.toquetin.notifications

import com.reinovalabs.toquetin.model.OrderStatus
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationPolicyTest {
    @Test
    fun `ready uses its dedicated channel and triple vibration`() {
        assertEquals(NotificationPolicy.READY_CHANNEL_ID, NotificationPolicy.channelId(OrderStatus.READY))
        assertArrayEquals(
            longArrayOf(0L, 700L, 250L, 700L, 250L, 700L),
            NotificationPolicy.READY_VIBRATION_PATTERN,
        )
    }

    @Test
    fun `other states use the general priority channel`() {
        listOf(OrderStatus.RECEIVED, OrderStatus.PREPARING, OrderStatus.DELIVERED, OrderStatus.CANCELLED)
            .forEach { assertEquals(NotificationPolicy.GENERAL_CHANNEL_ID, NotificationPolicy.channelId(it)) }
        assertArrayEquals(longArrayOf(0L, 300L), NotificationPolicy.GENERAL_VIBRATION_PATTERN)
    }

    @Test
    fun `state events alert while estimate updates remain silent`() {
        listOf("TRACKING_STARTED", "STATUS_CHANGED", "ORDER_READY", "ORDER_CLOSED")
            .forEach { assertTrue(NotificationPolicy.shouldAlert(it)) }
        assertFalse(NotificationPolicy.shouldAlert("ESTIMATE_CHANGED"))
        assertFalse(NotificationPolicy.shouldAlert(null))
    }
}
