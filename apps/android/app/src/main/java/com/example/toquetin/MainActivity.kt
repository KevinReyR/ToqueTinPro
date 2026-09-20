package com.reinovalabs.toquetin

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import com.reinovalabs.toquetin.data.TrackingClient
import com.reinovalabs.toquetin.data.TrackingLink
import com.reinovalabs.toquetin.model.OrderSnapshot
import com.reinovalabs.toquetin.notifications.TrackingNotifications
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.launch
import java.net.URI

class MainActivity : ComponentActivity() {
    private val trackingClient = TrackingClient()
    private var snapshot by mutableStateOf<OrderSnapshot?>(null)
    private var error by mutableStateOf<String?>(null)
    private var trackingLink: TrackingLink? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        openIntent(intent)
        setContent { ToqueTinTheme { Surface(Modifier.fillMaxSize(), color = WarmCanvas) { TrackingContent(snapshot, error) } } }
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); openIntent(intent) }

    private fun openIntent(intent: Intent) {
        val link = intent.data?.toString()?.let { runCatching { URI(it) }.getOrNull() }?.let(TrackingLink::parse) ?: return
        trackingLink = link
        lifecycleScope.launch {
            runCatching { trackingClient.open(link) }
                .onSuccess { snapshot = it; error = null; registerToken(link); TrackingNotifications.show(this@MainActivity, it) }
                .onFailure {
                    Log.e("ToqueTinTracking", "Tracking failed: ${it.message}", it)
                    error = "No pudimos abrir este seguimiento. Solicita el QR nuevamente."
                }
        }
    }

    private fun registerToken(link: TrackingLink) {
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token: String ->
            lifecycleScope.launch { runCatching { trackingClient.registerFcmToken(link, token) } }
        }
    }

}

private val WarmCanvas = Color(0xFFF3EFE7)
private val Accent = Color(0xFFD85F3B)

@Composable
private fun TrackingContent(snapshot: OrderSnapshot?, error: String?) {
    val context = LocalContext.current
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted && snapshot != null) TrackingNotifications.show(context, snapshot)
    }
    LaunchedEffect(snapshot) {
        if (snapshot != null && Build.VERSION.SDK_INT >= 33) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
    when {
        error != null -> Box(Modifier.fillMaxSize().padding(28.dp), contentAlignment = Alignment.Center) { Text(error, style = MaterialTheme.typography.titleLarge) }
        snapshot == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Accent) }
        else -> Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Spacer(Modifier.height(22.dp)); Text("ToqueTin", fontWeight = FontWeight.SemiBold); Spacer(Modifier.height(18.dp))
            Text(snapshot.restaurantName.uppercase(), color = Accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text("Pedido ${snapshot.orderNumber}", color = Color(0xFF76685E), fontSize = 18.sp)
            Text(snapshot.statusLabel(), fontSize = 52.sp, lineHeight = 50.sp, fontWeight = FontWeight.Bold, letterSpacing = (-2).sp)
            Text(snapshot.etaLabel(), color = Accent, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { repeat(4) { index -> Box(Modifier.weight(1f).height(5.dp).background(if (index < snapshot.step()) Accent else Color(0xFFD9CEC2), RoundedCornerShape(4.dp))) } }
            snapshot.pickupInstructions?.let { Text(it, Modifier.fillMaxWidth().background(Color(0xFFFFFAF2), RoundedCornerShape(20.dp)).padding(18.dp)) }
            Text("Visible en tu pantalla bloqueada", color = Color(0xFF2F704F), fontWeight = FontWeight.Medium)
        }
    }
}

@Composable
private fun ToqueTinTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = lightColorScheme(primary = Accent, background = WarmCanvas, surface = WarmCanvas), content = content)
}
