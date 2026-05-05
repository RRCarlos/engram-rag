# 🧠 Engram RAG Dashboard

Dashboard minimalista, funcional y con personalidad para monitorear el sistema **Engram RAG for Agent Improvement**.

## ✨ Características

- **Dark Mode Elegante**: Fondo dark con acentos cyan/purple
- **Tipografía Moderna**: Inter (texto) + Roboto Mono (código)
- **Iconos**: Emojis y Unicode para una experiencia visual rica
- **Animaciones**: Fade-in, hover effects, pulse en el botón de actualizar
- **Grid de Tarjetas**: Layout responsive con sombras y bordes redondeados
- **Datos en Tiempo Real (Simulado)**: Conexión con Engram RAG

## 📊 Secciones del Dashboard

1. **Total Observaciones**: Contador grande con el total de observaciones en Engram
2. **Por Agente**: Gráfico de barras horizontal mostrando observaciones por agente SDD
3. **Topic Keys**: Badges con los topic keys activos
4. **Timeline**: Últimas observaciones con título, tipo y fecha

## 🚀 Cómo Usar

1. Abre `index.html` en tu navegador (doble clic o arrastra al navegador)
2. Verás las tarjetas con datos hardcodeados iniciales
3. Haz clic en "🔄 Actualizar Datos" para simular una carga desde Engram
4. El botón mostrará una animación de carga y luego actualizará con nuevos datos

## 🎨 Personalización

### Cambiar Colores
Edita las variables en `style.css`:
```css
:root {
  --accent-cyan: #00d4ff;
  --accent-purple: #9b59b6;
  /* ... más variables */
}
```

### Cambiar Datos
Edita el objeto `engramData` en `app.js`:
```javascript
const engramData = {
  totalObservations: 8,
  byAgent: { /* ... */ },
  // ...
};
```

## 📋 Archivos

- `index.html` - Estructura principal
- `style.css` - Estilos dark mode con animaciones
- `app.js` - Lógica y datos (hardcodeados)
- `README.md` - Este archivo

## 🔮 Futuro

- [ ] Conectar con API real de Engram cuando esté disponible
- [ ] Gráficos interactivos (Chart.js o D3.js)
- [ ] Filtros por agente, tipo, fecha
- [ ] Modo claro/oscuro toggle

---

**Creado con ❤️ y estilo no soso para Carlos** 🚀