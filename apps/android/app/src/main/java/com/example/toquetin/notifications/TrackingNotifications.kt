package com.reinovalabs.toquetin.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.reinovalabs.toquetin.MainActivity
import com.reinovalabs.toquetin.model.OrderSnapshot

object TrackingNotifications {
    private const val CHANNEL_ID = "order_tracking"
    private const val NOTIFICATION_ID = 143

    fun createChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Seguimiento de pedidos", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Estado y tiempo restante de tu pedido"
        })
    }

    fun show(context: Context, snapshot: OrderSnapshot) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val intent = Intent(context, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("Pedido ${snapshot.orderNumber} · ${snapshot.statusLabel()}")
            .setContentText(snapshot.etaLabel())
            .setStyle(NotificationCompat.BigTextStyle().bigText("${snapshot.restaurantName} · ${snapshot.statusLabel()} · ${snapshot.etaLabel()}"))
            .setContentIntent(pendingIntent)
            .setPriority(if (snapshot.status.name == "READY") NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setOnlyAlertOnce(snapshot.status.name != "READY")
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
