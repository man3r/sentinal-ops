import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import IncidentFeed from './pages/IncidentFeed';
import IncidentDetail from './pages/IncidentDetail';
import AuditTrail from './pages/AuditTrail';
import Integrations from './pages/Integrations';
import RepoManager from './pages/RepoManager';
import GuardrailConfig from './pages/GuardrailConfig';
import TokenSpend from './pages/TokenSpend';
import KnowledgeBase from './pages/KnowledgeBase';
import Observatory from './pages/Observatory';
import IncidentStudio from './pages/IncidentStudio';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/observatory" replace />} />
          <Route path="incidents" element={<IncidentFeed />} />
          <Route path="incidents/:id" element={<IncidentDetail />} />
          <Route path="observatory" element={<Observatory />} />
          <Route path="audit" element={<AuditTrail />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="repos" element={<RepoManager />} />
          <Route path="guardrails" element={<GuardrailConfig />} />
          <Route path="spend" element={<TokenSpend />} />
          <Route path="knowledge" element={<KnowledgeBase />} />
          <Route path="studio" element={<IncidentStudio />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
