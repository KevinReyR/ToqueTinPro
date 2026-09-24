self.addEventListener("push", (event) => {
  const message = event.data ? event.data.json() : {};
  if (message.eventKind === "ESTIMATE_CHANGED") return;
  const snapshot = message.snapshot ?? {};
  const ready = message.eventKind === "ORDER_READY";
  const labels = { RECEIVED: "Recibido", PREPARING: "Preparando", READY: "Listo para recoger", DELIVERED: "Entregado", CANCELLED: "Cancelado" };
  event.waitUntil(self.registration.showNotification(
    ready ? `Pedido ${snapshot.orderNumber} listo` : `Pedido ${snapshot.orderNumber} · ${labels[snapshot.status] ?? "Actualizado"}`,
    {
      body: ready ? "Ya puedes acercarte a recogerlo." : `${snapshot.restaurantName ?? "ToqueTin"} · ${labels[snapshot.status] ?? "Actualizado"}`,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: `order-${snapshot.publicNonce ?? snapshot.orderNumber}`,
      renotify: ["STATUS_CHANGED", "ORDER_READY", "ORDER_CLOSED"].includes(message.eventKind),
      data: { url: snapshot.publicNonce ? `/tracking/${snapshot.publicNonce}` : "/" },
    },
  ));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    const existing = windows.find((client) => client.url === target);
    if (existing) return existing.focus();
    return self.clients.openWindow(target);
  }));
});
