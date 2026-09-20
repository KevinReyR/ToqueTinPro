self.addEventListener("push", (event) => {
  const message = event.data ? event.data.json() : {};
  const snapshot = message.snapshot ?? {};
  const ready = message.eventKind === "ORDER_READY";
  event.waitUntil(self.registration.showNotification(
    ready ? `Pedido ${snapshot.orderNumber} listo` : `Pedido ${snapshot.orderNumber}`,
    {
      body: ready ? "Ya puedes acercarte a recogerlo." : `${snapshot.status ?? "Actualizado"}`,
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
  event.waitUntil(self.clients.openWindow(event.notification.data?.url ?? "/"));
});
