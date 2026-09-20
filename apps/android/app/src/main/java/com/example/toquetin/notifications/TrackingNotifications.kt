package com.reinovalabs.toquetin.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.reinovalabs.toquetin.MainActivity
import com.reinovalabs.toquetin.data.TrackingSessionStore
import com.reinovalabs.toquetin.model.OrderSnapshot

object TrackingNotifications {
    private const val NOTIFICATION_ID = 143

    fun createChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannels(listOf(
            NotificationChannel(
                NotificationPolicy.GENERAL_CHANNEL_ID,
                "Actualizaciones del pedido",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Alertas de cambios de estado del pedido"
                enableVibration(true)
                vibrationPattern = NotificationPolicy.GENERAL_VIBRATION_PATTERN
            },
            NotificationChannel(
                NotificationPolicy.READY_CHANNEL_ID,
                "Pedido listo para recoger",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Alerta destacada cuando el pedido está listo"
                enableVibration(true)
                vibrationPattern = NotificationPolicy.READY_VIBRATION_PATTERN
            },
        ))
    }

    fun show(context: Context, snapshot: OrderSnapshot, alert: Boolean = false) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val intent = Intent(context, MainActivity::class.java).apply {
            TrackingSessionStore.load(context)?.let { data = Uri.parse(it) }
        }
        val pendingIntent = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val builder = NotificationCompat.Builder(context, NotificationPolicy.channelId(snapshot.status))
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("Pedido ${snapshot.orderNumber} · ${snapshot.statusLabel()}")
            .setContentText(snapshot.etaLabel())
            .setStyle(NotificationCompat.BigTextStyle().bigText("${snapshot.restaurantName} · ${snapshot.statusLabel()} · ${snapshot.etaLabel()}"))
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setOnlyAlertOnce(!alert)
            .setSilent(!alert)
            .setOngoing(snapshot.status.name !in setOf("DELIVERED", "CANCELLED"))
            .setRequestPromotedOngoing(true)
            .setShortCriticalText(snapshot.etaLabel().take(7))
        if (snapshot.status.name in setOf("DELIVERED", "CANCELLED")) {
            builder.setTimeoutAfter(15 * 60 * 1000L).setAutoCancel(true)
        }
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
    }

    fun dismiss(context: Context) = NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
}
