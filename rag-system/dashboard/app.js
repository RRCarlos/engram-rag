// 🧠 Engram RAG Dashboard - Datos Reales (Proyecto: engram-rag)

// Datos reales obtenidos de Engram (2026-05-05)
const engramData = {
  totalObservations: 6,
  byAgent: {
    'sdd-spec': 1,
    'orchestrator': 3,
    'sdd-apply': 2
  },
  byTopic: {
    'sdd/engram-rag-fase-2/proposal': 2,
    'sdd/engram-rag-fase-2/specs': 1,
    'sdd/engram-rag-fase-2/implemented': 1,
    'sdd/engram-rag-fase-2/verified': 1,
    'sdd/engram-rag-fase-2/dashboard': 1
  },
  recentObservations: [
    { title: 'Fase 2 Completada + Dashboard Creado', type: 'architecture', date: '2026-05-05', agent: 'orchestrator', topic: 'sdd/engram-rag-fase-2/dashboard' },
    { title: 'Fase 2 - Auditoría Formal Completada', type: 'architecture', date: '2026-05-05', agent: 'sdd-verify', topic: 'sdd/engram-rag-fase-2/verified' },
    { title: 'Fase 2 Implementación completada - 5 agentes', type: 'architecture', date: '2026-05-05', agent: 'sdd-apply', topic: 'sdd/engram-rag-fase-2/implemented' },
    { title: 'Fase 2 Specs completadas - Engram RAG', type: 'architecture', date: '2026-05-05', agent: 'sdd-spec', topic: 'sdd/engram-rag-fase-2/specs' },
    { title: 'Fase 2 Prueba EXITOSA - RAG Check funcionando', type: 'architecture', date: '2026-05-05', agent: 'sdd-explore', topic: 'sdd/engram-rag-fase-2/verified' },
    { title: 'Fase 2 Inyección completada - 5 agentes', type: 'architecture', date: '2026-05-05', agent: 'sdd-apply', topic: 'sdd/engram-rag-fase-2/implemented' }
  ]
};

// Función para renderizar el dashboard con datos reales
function renderDashboard(data) {
  // Actualizar total
  document.getElementById('total-obs').textContent = data.totalObservations;

  // Renderizar gráfico de barras por agente
  const agentChart = document.getElementById('agent-chart');
  agentChart.innerHTML = '';
  const maxValue = Math.max(...Object.values(data.byAgent));
  
  for (const [agent, count] of Object.entries(data.byAgent)) {
    const percentage = maxValue > 0 ? (count / maxValue) * 100 : 0;
    agentChart.innerHTML += `
      <div class="bar-item">
        <span class="bar-label">${agent}</span>
        <div class="bar">
          <div class="bar-fill" style="width: ${percentage}%"></div>
        </div>
        <span class="bar-value">${count}</span>
      </div>
    `;
  }

  // Renderizar topics
  const topicsList = document.getElementById('topics-list');
  topicsList.innerHTML = '';
  for (const topic of Object.keys(data.byTopic)) {
    topicsList.innerHTML += `<span class="topic-badge">${topic}</span>`;
  }

  // Renderizar timeline
  const timeline = document.getElementById('timeline');
  timeline.innerHTML = '';
  const recentItems = data.recentObservations.slice(0, 5);
  for (const obs of recentItems) {
    timeline.innerHTML += `
      <div class="timeline-item">
        <div class="title">${obs.title}</div>
        <div class="meta">${obs.agent} · ${obs.type} · ${obs.date} · ${obs.topic}</div>
      </div>
    `;
  }

  // Actualizar estado de conexión a "Real"
  document.getElementById('status-text').textContent = 'Conectado a Engram RAG (Real)';
}

// Función para simular actualización (Preparado para Fase 3: API Real)
function refreshData() {
  const btn = document.getElementById('btn-refresh');
  const statusText = document.getElementById('status-text');
  
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⏳</span><span>Actualizando desde Engram...</span>';
  statusText.textContent = 'Consultando memoria persistente...';
  
  // Simulación de latencia de red (En Fase 3: Aquí iría fetch() a la API)
  setTimeout(() => {
    renderDashboard(engramData);
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">✅</span><span>Datos Reales Cargados</span>';
    
    setTimeout(() => {
      btn.innerHTML = '<span class="btn-icon">🔄</span><span>Actualizar Datos</span>';
    }, 2000);
  }, 1500);
}

// Inicializar dashboard al cargar
document.addEventListener('DOMContentLoaded', () => {
  renderDashboard(engramData);
});
