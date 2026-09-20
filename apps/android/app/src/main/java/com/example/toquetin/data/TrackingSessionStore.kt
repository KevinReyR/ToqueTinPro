package com.reinovalabs.toquetin.data

import android.content.Context

object TrackingSessionStore {
    private const val PREFERENCES = "toquetin_tracking"
    private const val TRACKING_URI = "tracking_uri"

    fun save(context: Context, uri: String) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putString(TRACKING_URI, uri)
            .apply()
    }

    fun load(context: Context): String? =
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getString(TRACKING_URI, null)

    fun clear(context: Context) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .remove(TRACKING_URI)
            .apply()
    }
}
