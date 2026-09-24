# Especificación funcional — MVP de ToqueTin

## 1. Contexto y objetivo

Los restaurantes y las plazoletas de comida suelen depender de localizadores físicos, llamados por voz o pantallas compartidas para avisar que un pedido está listo. Estas alternativas generan costos operativos, requieren hardware dedicado o fuerzan al cliente a permanecer cerca del punto de entrega.

ToqueTin convierte el celular del cliente en un localizador digital. El restaurante crea un pedido y entrega un código QR asociado exclusivamente a este. El cliente lo abre sin registrarse, consulta el avance del pedido y recibe un aviso perceptible cuando está listo, según las capacidades y permisos de su dispositivo.

El objetivo del MVP es validar que el flujo `Crear pedido → Generar QR → Abrir seguimiento → Preparando → Listo → Entregado` reduce la fricción para el cliente y permite al restaurante comunicar el estado del pedido con seguridad y trazabilidad.

## 2. Usuarios

### 2.1. Operador autorizado del restaurante

Persona autorizada para operar un restaurante específico. Crea pedidos, entrega el QR al cliente, consulta la operación del día, actualiza estados, cancela pedidos permitidos y confirma la entrega. Solo puede consultar y gestionar información de los restaurantes a los que tiene acceso.

### 2.2. Cliente

Persona que espera un pedido. Accede al seguimiento mediante el QR, sin cuenta, registro, instalación ni entrega obligatoria de datos personales. Puede autorizar voluntariamente un canal que requiera un identificador, como WhatsApp, sin perder el acceso básico si lo rechaza. Necesita comprender rápidamente el estado, el tiempo estimado y las instrucciones de retiro, y recibir avisos claros por los canales que active.

## 3. Historias de usuario

- **HU-1 — Crear pedido:** Como operador, quiero registrar un pedido con un número visible único dentro de la jornada y un tiempo estimado para iniciar su seguimiento sin capturar información personal del cliente.
- **HU-2 — Entregar acceso:** Como operador, quiero obtener un QR exclusivo para el pedido para que el cliente pueda seguirlo de forma segura.
- **HU-3 — Consultar pedido:** Como cliente, quiero abrir el QR sin registrarme para conocer en pocos segundos dónde está mi pedido dentro del proceso.
- **HU-4 — Avanzar estado:** Como operador, quiero avanzar el pedido por sus estados válidos para mantener informado al cliente y conservar la trazabilidad.
- **HU-5 — Recibir actualizaciones:** Como cliente, quiero ver automáticamente los cambios de estado y de estimación para no tener que preguntar en el mostrador.
- **HU-6 — Activar avisos:** Como cliente, quiero elegir si deseo avisos adicionales para enterarme cuando el pedido esté listo aunque no esté mirando la pantalla.
- **HU-7 — Cancelar pedido:** Como operador, quiero cancelar un pedido antes de que esté listo y registrar un motivo comprensible para cerrar correctamente un pedido que no continuará.
- **HU-8 — Confirmar entrega:** Como operador, quiero marcar un pedido listo como entregado para cerrar su ciclo y medir el tiempo de recogida.
- **HU-9 — Consultar operación diaria:** Como operador, quiero ver los pedidos, totales y tiempos promedio del restaurante activo dentro de su día operativo para priorizar el trabajo y comprender su desempeño.
- **HU-10 — Auditar cambios:** Como responsable del restaurante, quiero que cada cambio de estado quede registrado para poder reconstruir el ciclo de un pedido.
- **HU-11 — Ajustar estimación:** Como operador, quiero corregir la estimación de un pedido que aún no está listo para mantener informado al cliente ante cambios en la preparación.
- **HU-12 — Definir el día operativo:** Como operador, quiero establecer la hora de corte del restaurante para que el dashboard represente correctamente su jornada habitual.
- **HU-13 — Mantener el pedido visible:** Como cliente, quiero ver el número, estado y tiempo restante en la pantalla bloqueada cuando mi dispositivo lo permita, sin perder el seguimiento web si la capacidad nativa no está disponible.

## 4. Requisitos funcionales

### RF-1. Crear un pedido

El producto deberá permitir que un operador autorizado cree un pedido para el restaurante activo. El número visible, que deberá ser único para ese restaurante dentro del día operativo, y el tiempo estimado de preparación serán obligatorios. Las instrucciones de retiro serán opcionales. No se solicitarán nombre, correo electrónico, teléfono ni otros datos personales del cliente.

**Criterios de aceptación EARS:**

- Cuando un operador autorizado proporcione un número visible y un tiempo estimado válidos, el producto deberá crear el pedido en estado `Recibido`.
- Cuando el operador proporcione instrucciones de retiro, el producto deberá asociarlas al pedido y mostrarlas en su seguimiento.
- Si falta el número visible o el tiempo estimado, el producto deberá rechazar la creación e indicar claramente qué dato debe corregirse.
- Si el número visible ya está asociado a otro pedido del mismo restaurante y día operativo, el producto deberá rechazar la creación y solicitar al operador que utilice otro número.
- Mientras dos pedidos pertenezcan a restaurantes o días operativos distintos, el producto deberá permitir que compartan el mismo número visible.
- Mientras un operador no tenga acceso al restaurante activo, el producto deberá impedirle crear pedidos para ese restaurante.
- El producto no deberá exigir ni almacenar datos personales del cliente para crear el pedido.

### RF-2. Generar y presentar el QR de seguimiento

Cada pedido creado deberá contar con un QR exclusivo que otorgue acceso únicamente al seguimiento público de ese pedido. El número visible del pedido no deberá funcionar como credencial de acceso.

**Criterios de aceptación EARS:**

- Cuando se cree correctamente un pedido, el producto deberá generar y presentar al operador un QR de seguimiento asociado exclusivamente a ese pedido.
- Cuando un cliente abra un QR válido y vigente, el producto deberá mostrar únicamente la información pública del pedido asociado.
- Si el QR es inválido, está revocado o no corresponde a un pedido accesible, el producto deberá mostrar un mensaje seguro y no deberá revelar si existen otros pedidos.
- Mientras el QR permanezca vigente, el cliente deberá poder volver a abrir el seguimiento del mismo pedido.

### RF-3. Mostrar el seguimiento público

La vista de seguimiento deberá permitir que el cliente comprenda el estado del pedido sin registro, inicio de sesión, instalación ni entrega de información personal.

**Criterios de aceptación EARS:**

- Cuando el cliente abra un seguimiento válido, el producto deberá mostrar el restaurante, el número visible del pedido, el estado actual, el tiempo estimado y, cuando existan, las instrucciones de retiro.
- Mientras el pedido esté activo, el producto deberá destacar su estado actual y presentar el siguiente paso esperado de forma comprensible.
- El producto deberá permitir el acceso al seguimiento sin solicitar cuenta, correo electrónico, teléfono ni instalación.
- Si no se puede recuperar el pedido al abrir el seguimiento, el producto deberá mostrar una explicación clara y una opción para volver a intentarlo sin exponer información interna.

### RF-4. Gestionar el ciclo de estados

El flujo normal será secuencial: `Recibido → Preparando → Listo → Entregado`. No se permitirán saltos, retrocesos ni cambios posteriores desde un estado final.

**Criterios de aceptación EARS:**

- Cuando un operador autorizado avance un pedido `Recibido`, el producto deberá cambiarlo a `Preparando`.
- Cuando un operador autorizado avance un pedido `Preparando`, el producto deberá cambiarlo a `Listo`.
- Cuando un operador autorizado confirme la entrega de un pedido `Listo`, el producto deberá cambiarlo a `Entregado`.
- Si se intenta omitir un estado, retroceder o modificar un pedido `Entregado` o `Cancelado`, el producto deberá rechazar la acción y conservar el estado vigente.
- Si el operador repite una acción que ya fue aplicada, el producto deberá evitar cambios e historiales duplicados y mostrar el estado vigente.
- Mientras un operador no tenga acceso al restaurante del pedido, el producto deberá impedir cualquier cambio de estado.

### RF-5. Cancelar un pedido

El operador podrá cancelar un pedido únicamente desde `Recibido` o `Preparando`. Deberá elegir `Solicitud del cliente`, `Producto no disponible`, `Error en el pedido`, `Problema operativo` u `Otro`. Cuando elija `Otro`, deberá escribir un texto breve. El motivo resultante será visible para el cliente y la cancelación convertirá el pedido en un estado final.

**Criterios de aceptación EARS:**

- Cuando un operador autorizado cancele un pedido `Recibido` o `Preparando` e indique un motivo válido, el producto deberá cambiarlo a `Cancelado` y mostrar el motivo en el seguimiento.
- Cuando el operador elija uno de los cuatro motivos predefinidos, el producto deberá permitir la cancelación sin exigir texto adicional.
- Cuando el operador elija `Otro` e ingrese un texto breve válido, el producto deberá utilizar ese texto como motivo visible de cancelación.
- Si el operador elige `Otro` y no proporciona texto, el producto deberá rechazar la cancelación e indicar que debe escribir el motivo.
- Si se intenta cancelar un pedido `Listo`, `Entregado` o `Cancelado`, el producto deberá rechazar la acción y conservar su estado.
- Cuando el pedido sea cancelado, el producto deberá comunicar el cambio automáticamente al seguimiento abierto.
- Mientras el pedido esté `Cancelado`, el producto deberá impedir nuevas transiciones.

### RF-6. Actualizar el seguimiento automáticamente

Los cambios válidos de estado y de información visible deberán reflejarse en el seguimiento abierto sin exigir que el cliente recargue manualmente la página.

**Criterios de aceptación EARS:**

- Cuando cambie el estado de un pedido, el producto deberá actualizar automáticamente todos los seguimientos abiertos y vigentes de ese pedido.
- Cuando el seguimiento reciba una actualización, el producto deberá mostrar el nuevo estado sin perder el contexto visible del pedido.
- Si se interrumpe la conexión, el producto deberá conservar el último estado conocido, advertir que puede estar desactualizado y reintentar automáticamente la actualización.
- Mientras la actualización automática no esté disponible, el producto deberá ofrecer al cliente una acción de actualización manual.
- Cuando se recupere la conexión, el producto deberá reemplazar la información posiblemente desactualizada por el estado vigente y retirar la advertencia.

### RF-7. Destacar que el pedido está listo

El paso a `Listo` deberá producir un cambio visual inequívoco. Este cambio será el mecanismo principal y no dependerá de permisos ni de capacidades adicionales del dispositivo.

**Criterios de aceptación EARS:**

- Cuando el pedido cambie a `Listo`, el producto deberá transformar de forma claramente perceptible la vista de seguimiento y comunicar que el cliente puede retirarlo.
- Mientras el pedido permanezca `Listo`, la indicación de retiro deberá conservar la máxima prioridad visual de la vista.
- Si los avisos adicionales no están disponibles o fallan, el producto deberá mantener íntegro el aviso visual y el seguimiento.

### RF-8. Activar y gestionar avisos adicionales

El seguimiento deberá ofrecer una acción explícita «Recibir avisos del pedido». Esta abrirá un selector que permitirá activar uno o varios canales disponibles: navegador, aplicación y WhatsApp. Solo después de elegir un canal se solicitarán sus permisos o datos aplicables. Las aplicaciones sin enlace de distribución permanecerán visibles como «Próximamente». Los avisos operativos cubrirán `Preparando`, `Listo`, `Entregado` y `Cancelado`; los cambios exclusivos de estimación serán silenciosos.

**Criterios de aceptación EARS:**

- Cuando el cliente pulse «Recibir avisos del pedido», el producto deberá abrir una hoja accesible titulada «¿Dónde quieres recibir avisos?» y deberá permitir activar más de un canal.
- Cuando el cliente conceda un permiso aplicable, el producto deberá confirmar qué canal quedó activo para ese pedido y cambiar la acción principal a «Gestionar avisos».
- Cuando un pedido con avisos activados cambie a `Preparando`, `Listo`, `Entregado` o `Cancelado`, el producto deberá intentar un aviso en cada canal activo; la activación inicial podrá confirmar el estado `Recibido` sin generar un evento duplicado.
- Cuando solo cambie la estimación, el producto deberá actualizar las superficies compatibles sin producir una alerta perceptible ni enviar un mensaje de WhatsApp.
- Si el cliente rechaza un permiso, el dispositivo no admite un canal o un aviso falla, el producto deberá explicarlo sin bloquear ni degradar el seguimiento principal.
- Mientras el cliente no haya realizado la acción explícita, el producto no deberá solicitar permisos de notificación.
- Mientras las aplicaciones no tengan enlaces de tienda configurados, la opción App deberá mostrarse deshabilitada con el estado «Próximamente».
- Cuando el cliente elija WhatsApp, el producto deberá crear un código opaco de un solo uso con vigencia de diez minutos, abrir el número central de ToqueTin con el mensaje preparado y activar el canal únicamente tras recibir y validar ese mensaje.
- Cuando exista un canal activo, el cliente deberá poder desactivarlo individualmente sin afectar el seguimiento ni otros canales.
- La hoja deberá conservar el foco, admitir teclado y lector de pantalla, respetar la preferencia de reducir movimiento y ofrecer áreas táctiles suficientes.

### RF-8A. Gestionar contactos y consentimientos de WhatsApp

La activación operativa de WhatsApp será independiente de cualquier uso comercial. Después de confirmar el aviso del pedido, ToqueTin podrá formular una única pregunta que cubra conjuntamente novedades de ToqueTin y de sus restaurantes aliados, identificando ambos alcances de forma clara. El consentimiento comenzará desactivado, se solicitará una sola vez por contacto hasta que el titular cambie su decisión y las campañas permanecerán fuera de alcance.

**Criterios de aceptación EARS:**

- Cuando un código válido se reciba dentro de diez minutos, el producto deberá consumirlo una sola vez, asociar el canal al pedido y responder «Avisos activos para el Pedido {número} de {restaurante}».
- Si el código está vencido, fue consumido, fue alterado o no corresponde a una sesión vigente, el producto deberá rechazarlo sin revelar información del pedido.
- Cuando se capture un identificador de WhatsApp, el producto deberá almacenarlo cifrado y mantener únicamente un digest para deduplicación e idempotencia.
- Cuando el contacto no haya respondido previamente al consentimiento comercial unificado, el producto deberá enviar exactamente una solicitud que identifique a ToqueTin y a sus restaurantes aliados.
- Mientras exista una decisión comercial previa, incluida aceptación, rechazo o revocación, el producto no deberá solicitarla nuevamente al activar pedidos posteriores.
- Cuando Meta entregue eventos de estado sin un mensaje entrante, el adaptador deberá descartarlos del flujo de conversación sin invocar el endpoint de mensajes entrantes ni registrar errores de normalización.
- Cuando se consulte información desde un restaurante, el producto deberá impedir el acceso a contactos o consentimientos de otros restaurantes.
- Cuando el cliente responda a una solicitud comercial, el producto deberá registrar de forma inmutable la finalidad, el responsable, la versión de política, la fuente, la decisión y sus fechas.
- Mientras no exista consentimiento comercial vigente, el producto deberá eliminar o anonimizar el identificador cuando expire el seguimiento operativo.
- Mientras exista consentimiento comercial vigente, el producto podrá conservar el identificador hasta su revocación, sin habilitar campañas en esta fase.
- Cuando el titular retire un consentimiento o envíe una palabra de baja, el producto deberá revocar la finalidad correspondiente y conservar la evidencia mínima exigible.
- El panel deberá mostrar «Clientes y campañas · Próximamente» y no deberá permitir envíos comerciales.

### RF-9. Registrar el historial de estados

Cada transición válida deberá conservarse como un evento trazable con su momento de ocurrencia. El historial no se sobrescribirá al avanzar el pedido.

**Criterios de aceptación EARS:**

- Cuando se cree un pedido, el producto deberá registrar el inicio de su ciclo en estado `Recibido`.
- Cuando ocurra una transición válida, el producto deberá registrar el estado anterior, el nuevo estado y el momento del cambio.
- Cuando se cancele un pedido, el producto deberá registrar también el motivo asociado.
- Si una transición es rechazada, el producto no deberá alterar el estado actual ni añadir un evento de transición válido.
- El producto deberá conservar la información necesaria para calcular los tiempos entre creación, preparación, pedido listo, entrega y cancelación.

### RF-10. Mantener y expirar el seguimiento final

Después de una entrega o cancelación, el seguimiento permanecerá disponible en modo de solo lectura durante 24 horas. Al finalizar ese plazo no deberá mostrar información del pedido.

**Criterios de aceptación EARS:**

- Cuando un pedido pase a `Entregado` o `Cancelado`, el producto deberá mantener su resultado final consultable durante las 24 horas siguientes.
- Mientras el seguimiento terminal esté dentro de esas 24 horas, el producto deberá mostrar el estado final y deberá impedir cualquier acción que modifique el pedido.
- Cuando hayan transcurrido 24 horas desde el paso al estado final, el producto deberá mostrar que el seguimiento expiró y ocultar la información del pedido.
- Si un acceso es revocado antes del vencimiento, el producto deberá dejar de mostrar inmediatamente la información del pedido.

### RF-11. Mostrar la operación diaria

El dashboard deberá presentar la operación del restaurante activo para su día operativo. Cada restaurante definirá una hora de corte diaria; la jornada abarcará desde esa hora hasta la misma hora del día siguiente, según la hora local del restaurante. La hora predeterminada será `00:00`.

El resumen incluirá los pedidos creados durante la jornada, sus totales por estado, el total de pedidos creados, el total de pedidos activos, el tiempo promedio de preparación y el tiempo promedio de recogida. Se considerarán activos los pedidos en `Recibido`, `Preparando` o `Listo`.

**Criterios de aceptación EARS:**

- Cuando un operador acceda al dashboard, el producto deberá mostrar únicamente los pedidos del restaurante activo que correspondan al día operativo.
- El producto deberá agrupar los pedidos por su estado actual para facilitar la priorización.
- Cuando un pedido cambie de estado, el producto deberá reflejarlo en el grupo y total correspondientes.
- Mientras se muestre una jornada, el producto deberá presentar el total de pedidos creados en ella y el total de pedidos que continúan activos.
- Cuando un intervalo `Preparando → Listo` termine dentro del día operativo, el producto deberá incluir su duración en el tiempo promedio de preparación de esa jornada.
- Cuando un intervalo `Listo → Entregado` termine dentro del día operativo, el producto deberá incluir su duración en el tiempo promedio de recogida de esa jornada.
- Mientras un pedido esté cancelado o no haya completado el intervalo correspondiente, el producto deberá excluirlo del promedio asociado.
- Si ningún pedido ha completado un intervalo durante el día operativo, el producto deberá indicar que todavía no existen datos para ese promedio en lugar de presentar una duración engañosa.
- Mientras un usuario tenga acceso a varios restaurantes, el producto deberá mantener claramente identificado el restaurante activo y evitar mezclar sus pedidos.
- Si no existen pedidos para el día operativo, el producto deberá mostrar un estado vacío comprensible y permitir iniciar la creación de un pedido.
- Mientras el restaurante no tenga una hora de corte personalizada, el producto deberá usar `00:00` de su hora local como inicio del día operativo.
- Cuando cualquier operador autorizado cambie la hora de corte, el producto deberá conservar la jornada en curso sin modificaciones y aplicar la nueva hora desde la jornada siguiente.
- Si un usuario sin acceso vigente al restaurante intenta cambiar la hora de corte, el producto deberá rechazar la acción y conservar la configuración actual.

### RF-12. Aislar organizaciones y restaurantes

La información y las acciones operativas deberán limitarse a la organización y a los restaurantes autorizados para cada usuario. El acceso público mediante QR se limitará a un único pedido.

**Criterios de aceptación EARS:**

- Mientras un operador esté usando el producto, solo deberá poder consultar y gestionar restaurantes para los que tenga autorización vigente.
- Si un operador intenta acceder a un pedido de otro restaurante sin autorización, el producto deberá denegar el acceso sin revelar sus datos.
- Cuando un cliente use un QR válido, el producto deberá limitar el acceso al pedido asociado y a la información necesaria para su seguimiento.
- Si se manipula o reutiliza un acceso para consultar otro pedido, el producto deberá rechazar la solicitud sin revelar identificadores internos ni confirmar la existencia del pedido buscado.

### RF-13. Gestionar el tiempo estimado

El tiempo estimado de preparación deberá ser definido manualmente al crear el pedido y deberá mostrarse al cliente como una estimación, no como una garantía. Cualquier operador autorizado podrá ajustarlo mientras el pedido esté en `Recibido` o `Preparando`.

**Criterios de aceptación EARS:**

- Cuando se cree un pedido, el producto deberá exigir un tiempo estimado válido y expresarlo de forma comprensible para el cliente.
- Cuando un operador autorizado modifique la estimación de un pedido `Recibido` o `Preparando`, el producto deberá guardar el nuevo valor y actualizar automáticamente el seguimiento abierto.
- Cuando el seguimiento reciba una estimación modificada, el producto deberá mostrar el nuevo valor e indicar claramente que fue actualizado.
- Si se intenta modificar la estimación de un pedido `Listo`, `Entregado` o `Cancelado`, el producto deberá rechazar la acción y conservar la estimación vigente.
- Mientras el pedido no haya alcanzado un estado final, el seguimiento deberá diferenciar claramente la estimación vigente del estado real.
- Cuando el pedido pase a `Listo`, el producto deberá priorizar el aviso de retiro sobre la estimación inicial.

### RF-14. Ofrecer seguimiento visible fuera de la aplicación

El mismo QR deberá abrir la mejor superficie disponible: App Clip en iOS, app instalada mediante App Link en Android o seguimiento web como fallback universal. Las superficies nativas serán opcionales y mostrarán la misma proyección pública del pedido.

**Criterios de aceptación EARS:**

- Cuando un iPhone compatible abra el App Clip desde el QR y Live Activities esté habilitado, el producto deberá iniciar automáticamente una Live Activity asociada únicamente al pedido validado.
- Cuando cambie estado o estimación, el backend deberá publicar una actualización idempotente para las superficies nativas registradas después de confirmar la transacción del pedido.
- Mientras el pedido esté `Recibido` o `Preparando`, la superficie deberá mostrar una cuenta regresiva aproximada; si la estimación vence, deberá mostrar «Casi listo» y nunca un tiempo negativo.
- Cuando el pedido pase a `Listo`, la superficie deberá reemplazar la estimación por una indicación inequívoca de retiro y usar una alerta perceptible permitida por la plataforma.
- Cuando la app Android reciba una transición de estado mediante FCM, deberá usar una alerta de prioridad alta; las actualizaciones exclusivas de estimación y las reconciliaciones por polling deberán permanecer silenciosas.
- Cuando el pedido pase a `Listo` en Android, la alerta deberá distinguirse con seis vibraciones de 700 ms separadas por pausas de 250 ms, salvo que la configuración del dispositivo limite la vibración.
- Cuando el pedido pase a `Entregado` o `Cancelado`, la actividad deberá terminar y podrá conservar el resultado final hasta 15 minutos; una revocación deberá retirarla inmediatamente.
- Si la capacidad nativa está deshabilitada, falla, no existe o el cliente rechaza permisos, el seguimiento web deberá permanecer completo y utilizable.
- El producto no deberá incluir PII, tokens, IDs internos ni instrucciones sensibles en Lock Screen, Dynamic Island o notificaciones.

## 5. Requisitos no funcionales

### RNF-1. Seguridad

- El acceso público deberá ser difícil de adivinar, específico para un pedido, revocable y temporal.
- El número visible no deberá conceder acceso al seguimiento.
- Los mensajes de error no deberán revelar información de otros pedidos, restaurantes, organizaciones ni credenciales de acceso.

### RNF-2. Privacidad

- El flujo del cliente no deberá requerir datos personales.
- La vista pública deberá mostrar solo la información necesaria para reconocer y retirar el pedido.
- Una vez expirado o revocado el seguimiento, no deberá exponerse información del pedido.

### RNF-3. Aislamiento

- Ningún usuario del restaurante deberá consultar o modificar información fuera de sus autorizaciones vigentes.
- La información de dos restaurantes no deberá mezclarse en vistas, búsquedas, totales ni acciones.

### RNF-4. Experiencia móvil y multiplataforma

- El seguimiento deberá priorizar pantallas móviles y permitir entender el estado actual en pocos segundos.
- Las acciones esenciales deberán ser legibles, distinguibles y utilizables mediante interacción táctil.
- El flujo no deberá depender de instalar una aplicación.
- El App Clip y las apps ligeras deberán limitarse al seguimiento de pedidos y compartir contratos con la web.
- La experiencia mínima será iOS 16.1 y Android API 26; las Live Updates promovidas se habilitarán en Android 16+.

### RNF-5. Accesibilidad

- Los estados y errores no deberán comunicarse exclusivamente mediante color, sonido o vibración.
- El aviso de pedido listo deberá incluir texto visible y una jerarquía perceptible.
- Las funciones principales deberán poder usarse aunque los avisos adicionales no estén disponibles.

### RNF-6. Disponibilidad percibida y recuperación

- Una interrupción temporal no deberá borrar el último estado conocido.
- El producto deberá distinguir información vigente de información posiblemente desactualizada.
- Los errores recuperables deberán ofrecer una acción clara de reintento.

### RNF-7. Trazabilidad

- El ciclo completo de cada pedido deberá poder reconstruirse sin sobrescribir eventos previos.
- Los tiempos registrados deberán permitir calcular duración de preparación, espera para retiro y duración total.

### RNF-8. Claridad del lenguaje

- Los mensajes visibles deberán estar en español claro, ser orientados a la acción y evitar términos técnicos.
- Las estimaciones deberán presentarse como aproximadas y los estados finales como inequívocos.

## 6. Casos límite y comportamiento esperado

- **QR ilegible:** el cliente no puede abrir el seguimiento; el operador puede volver a presentar el mismo acceso vigente sin crear otro pedido.
- **QR inválido o manipulado:** se muestra un mensaje seguro, sin información del pedido ni confirmación sobre su existencia.
- **QR revocado:** el acceso deja de mostrar inmediatamente el pedido, incluso antes de las 24 horas posteriores al cierre.
- **QR expirado:** se informa la expiración sin mostrar restaurante, número, estado, motivo ni instrucciones.
- **Pedido inexistente:** se utiliza una respuesta equivalente a la de un acceso inválido para evitar revelar información.
- **Número visible repetido:** si ya existe dentro del mismo restaurante y día operativo, no se crea el pedido y se solicita otro número; la coincidencia se permite entre jornadas o restaurantes distintos.
- **Transición inválida:** se conserva el estado y el historial; el operador recibe una explicación útil.
- **Acción repetida:** no se duplica la transición ni su registro.
- **Dos acciones concurrentes:** solo las transiciones que respeten el estado vigente pueden producir cambios; el resultado mostrado debe converger al estado real del pedido.
- **Pérdida de conexión del cliente:** se conserva el último estado con una advertencia, se reintenta automáticamente y se permite actualizar manualmente.
- **Pérdida de conexión del operador:** no se presenta una acción como completada hasta tener confirmación; al recuperar conexión se muestra el estado vigente.
- **Permisos rechazados:** el seguimiento y el aviso visual continúan funcionando.
- **Dispositivo sin sonido, vibración o notificaciones:** se usan únicamente los canales disponibles y se mantiene el aviso visual.
- **Pedido listo mientras el seguimiento está cerrado:** si el cliente activó un canal capaz de avisar fuera de la vista y este sigue disponible, se intenta el aviso; en cualquier caso, al volver a abrir se muestra el estado `Listo`.
- **Pedido cancelado:** se muestra el estado final y el motivo breve durante la vigencia restante; no se permiten nuevas transiciones.
- **Motivo `Otro` vacío:** no se cancela el pedido hasta que el operador escriba un motivo breve.
- **Edición tardía de estimación:** no se modifica la estimación de un pedido `Listo`, `Entregado` o `Cancelado`.
- **Pedido entregado:** permanece en solo lectura durante 24 horas y después expira.
- **Acceso entre restaurantes:** se deniega sin revelar datos, aunque el usuario tenga acceso a otro restaurante de la misma organización.
- **Sin pedidos del día:** se muestra un estado vacío, no un error.
- **Sin intervalos completados:** el dashboard indica que aún no existen datos para el promedio correspondiente.
- **Pedido que cruza la hora de corte:** pertenece a la jornada en la que fue creado, pero cada duración se incorpora al promedio de la jornada en la que termina su intervalo correspondiente.
- **Cambio de hora de corte:** no reagrupa la jornada en curso ni sus pedidos; la nueva hora comienza a regir desde la jornada siguiente.

## 7. Fuera de alcance

- Pagos dentro de la plataforma.
- Menús, productos, modificadores, carrito y toma detallada del pedido.
- Marketplace o descubrimiento de restaurantes.
- Publicidad.
- Programas de fidelización.
- Captura obligatoria de nombre, correo electrónico o teléfono del cliente; WhatsApp solo podrá tratarse como canal opcional con consentimiento explícito.
- Consulta de bases de clientes y envío de campañas comerciales; la fase actual solo conserva consentimientos auditables.
- Pedidos que involucren más de un restaurante.
- Aplicaciones móviles completas con cuentas, historial, pagos o funciones distintas del seguimiento ligero aprobado.
- Localizadores físicos o hardware avanzado para el cliente.
- Integraciones con sistemas de punto de venta.
- Predicción automática de tiempos o decisiones basadas en inteligencia artificial.
- Comparaciones, métricas consolidadas o gestión operativa entre restaurantes.
- Reapertura de pedidos entregados o cancelados.
- Edición del contenido de un pedido, dado que el MVP no gestiona menús ni productos.

## 8. Criterios de finalización

La funcionalidad se considerará terminada cuando se pueda demostrar que:

1. Un operador autorizado crea un pedido con número visible único para el restaurante y día operativo, y recibe una explicación clara si intenta repetirlo.
2. El pedido recién creado queda en `Recibido` y produce un QR exclusivo.
3. Un cliente abre el QR sin registrarse y reconoce el restaurante, número, estado, estimación e instrucciones disponibles.
4. El cliente abre «Recibir avisos del pedido», activa uno o varios canales disponibles y puede revocarlos individualmente sin perder el seguimiento.
5. WhatsApp solo se activa después de consumir un código válido de un solo uso; las dos finalidades comerciales permanecen separadas y desactivadas inicialmente.
6. El operador avanza el pedido por `Recibido → Preparando → Listo → Entregado`, sin saltos ni retrocesos.
7. Cada cambio válido aparece automáticamente en el seguimiento y queda registrado una sola vez con su momento de ocurrencia.
8. Al llegar a `Listo`, el cliente recibe un cambio visual inequívoco y, si los activó y están disponibles, los avisos adicionales aplicables.
9. Rechazar permisos o usar un dispositivo sin capacidades adicionales no impide completar el seguimiento.
10. Un pedido `Recibido` o `Preparando` puede cancelarse con uno de los motivos definidos o con un texto obligatorio al elegir `Otro`; uno `Listo`, `Entregado` o `Cancelado` no puede cancelarse.
11. Ante pérdida de conexión, el cliente conserva el último estado con advertencia y dispone de reintento automático y manual.
12. Un pedido entregado o cancelado permanece en lectura durante 24 horas y luego deja de revelar información.
13. Un acceso inválido, manipulado, revocado o expirado no permite consultar el pedido ni inferir información sobre otros pedidos.
14. Un operador no puede consultar ni modificar pedidos de restaurantes no autorizados.
15. La estimación puede modificarse en `Recibido` o `Preparando`, el cliente ve automáticamente el valor actualizado y la edición se rechaza desde `Listo`.
16. El historial permite reconstruir el ciclo del pedido y calcular los tiempos entre sus hitos principales.
17. El dashboard muestra exclusivamente la jornada del restaurante activo, con totales por estado, total creado, total activo y los dos promedios definidos, sin mezclar restaurantes.
18. Los promedios incluyen únicamente intervalos que terminan dentro de la jornada mostrada y excluyen cancelados e intervalos incompletos.
19. La hora de corte comienza en `00:00` de la hora local, cualquier operador autorizado puede cambiarla y el cambio solo afecta la jornada siguiente.
20. Todos los casos límite definidos tienen un resultado verificable y comprensible para el usuario afectado.
21. Un QR válido abre App Clip, app instalada o web según la plataforma, siempre con fallback web.
22. En dispositivos nativos compatibles, `Pedido 143 · Preparando · ~4 min` permanece visible y converge al estado autoritativo hasta el cierre o revocación.
