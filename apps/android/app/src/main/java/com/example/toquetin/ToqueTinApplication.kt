package com.example.toquetin

import android.app.Application
import com.example.toquetin.notifications.TrackingNotifications
import java.net.CookieHandler
import java.net.CookieManager
import java.net.CookiePolicy

class ToqueTinApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        CookieHandler.setDefault(CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER))
        TrackingNotifications.createChannel(this)
    }
}
