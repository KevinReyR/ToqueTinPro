# Constitution — Localizador Digital de Pedidos

1. **Stack mínimo:** usar Next.js + TypeScript + Supabase/PostgreSQL como núcleo. Los clientes especializados aprobados son SwiftUI + ActivityKit para iOS/App Clip y Kotlin + Jetpack Compose para Android; no añadir otros frameworks, servicios o infraestructura sin necesidad documentada en la spec.
2. **Spec manda:** ninguna funcionalidad se implementa si no está definida en la spec activa; todo cambio funcional exige actualizar primero la spec.
3. **Lógica separada de UI:** reglas de negocio, acceso a datos y estados del pedido no pueden implementarse directamente dentro de componentes visuales.
4. **Tests obligatorios:** toda lógica de negocio nueva o corregida debe tener tests; una tarea no se considera terminada con tests existentes fallando.
5. **Persistencia real:** datos de negocio y estados relevantes deben persistirse en PostgreSQL; no usar estado local, mocks o memoria como fuente definitiva.
6. **Idioma consistente:** código, nombres, schemas, commits y logs en inglés; textos visibles para usuarios y mensajes funcionales de la aplicación en español.
7. **Fallback universal:** ninguna superficie nativa puede sustituir el seguimiento web. El QR debe continuar funcionando sin cuenta ni instalación en cualquier dispositivo compatible con la web.
8. **Estado único:** web, App Clip, Live Activity y Android representan la misma proyección pública autoritativa; ningún cliente mantiene un estado de pedido independiente.
