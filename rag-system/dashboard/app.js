// 🧠 Engram RAG Dashboard - Datos y Lógica

// Datos iniciales (hardcodeados basados en el proyecto real)
const engramData = {
  totalObservations: 8,
  byAgent: {
    'sdd-apply': 2,
    'sdd-spec': 2,
    'sdd-design': 1,
    'sdd-verify': 1,
    'sdd-explore': 2
  },
  byTopic: {
    'pattern/agent-rigor-protocol': 2,
    'sdd/engram-rag-fase-2/proposal': 1,
    'sdd/engram-rag-fase-2/specs': 1,
    'sdd/engram-rag-fase-2/implemented': 1,
    'sdd/engram-rag-fase-2/verified': 1
  },
  recentObservations: [
    { title: 'Fase 2 Prueba EXITOSA - RAG Check funcionando', type: 'architecture', date: '2026-05-05', agent: 'sdd-explore' },
    { title: 'Fase 2 Inyección completada - 5 agentes', type: 'architecture', date: '2026-05-05', agent: 'sdd-apply' },
    { title: 'Fase 2 Specs - Inyección en Agentes SDD', type: 'architecture', date: '2026-05-05', agent: 'sdd-spec' },
    { title: 'Fase 2 - Auditoría Formal Completada', type: 'architecture', date: '2026-05-05', agent: 'sdd-verify' },
    { title: 'Fase 2 Prueba EXITOSA - RAG Check funcionando', type: 'architecture', date: '2026-05-05', agent: 'sdd-explore' },
    { title: 'Fase 2 Inyección completada - 5 agentes', type: 'architecture', date: '2026-05-05', agent: 'sdd-apply' },
    { title: 'Fase 2 Specs - Inyección en Agentes SDD', type: 'architecture', date: '2026-05-05', agent: 'sdd-spec' },
    { title: 'Fase 2 - Auditoría Formal Completada', type: 'architecture', date: '2026-05-05', agent: 'sdd-verify' }
  ]
};

// Datos adicionales para simular actualización
const newData = {
  totalObservations: 10,
  recentObservations: [
    { title: '🎨 Dashboard Engram RAG Creado', type: 'architecture', date: '2026-05-05', agent: 'orchestrator' },
    { title: '🎨 Expansión Fase 2 - Más agentes', type: 'architecture', date: '2026-05-05', agent: 'sdd-apply' },
    ...engramData.recentObservations
  ]
};

// Función para renderizar el dashboard
function renderDashboard(data) {
  // Actualizar total
  document.getElementById('total-obs').textContent = data.totalObservations;

  // Renderizar gráfico de barras por agente
  const agentChart = document.getElementById('agent-chart');
  agentChart.innerHTML = '';
  const maxValue = Math.max(...Object.values(data.byAgent));
  
  for (const [agent, count] of Object.entries(data.byAgent)) {
    const percentage = (count / maxValue) * 100;
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
        <div class="meta">${obs.agent} · ${obs.type} · ${obs.date}</div>
      </div>
    `;
  }
}

// Función para "actualizar" datos (simulación)
function refreshData() {
  const btn = document.getElementById('btn-refresh');
  const statusText = document.getElementById('status-text');
  
  // Animación de carga
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⏳</span><span>Actualizando...</span>';
  statusText.textContent = 'Actualizando desde Engram RAG...';
  
  // Simular delay de red
  setTimeout(() => {
    renderDashboard(newData);
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">✅</span><span>¡Datos Actualizados!</span>';
    statusText.textContent = 'Conectado a Engram RAG (simulado)';
    
    // Volver al estado normal después de 2 segundos
    setTimeout(() => {
      btn.innerHTML = '<span class="btn-icon">🔄</span><span>Actualizar Datos</span>';
    }, 2000);
  }, 1500);
}

// Inicializar dashboard al cargar
document.addEventListener('DOMContentLoaded', () => {
  renderDashboard(engramData);
});