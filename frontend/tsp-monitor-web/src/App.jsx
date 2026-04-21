import { useState } from 'react';
import Header from './components/Header.jsx';
import HomePage from './pages/HomePage.jsx';
import TopologyPage from './pages/TopologyPage.jsx';
import RemoteControlPage from './pages/RemoteControlPage.jsx';
import VerifyPage from './pages/VerifyPage.jsx';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      <main style={{ flex: 1, padding: '24px 32px', maxWidth: 1500, margin: '0 auto', width: '100%' }}>
        {activeTab === 'overview' && <HomePage onNavigate={setActiveTab} />}
        {activeTab === 'topology' && <TopologyPage />}
        {activeTab === 'remote-control' && <RemoteControlPage />}
        {activeTab === 'verify' && <VerifyPage />}
      </main>
    </div>
  );
}
