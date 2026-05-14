import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Cases from './pages/Cases';
import DocumentGenerate from './pages/DocumentGenerate';
import Search from './pages/Search';
import Templates from './pages/Templates';
import Settings from './pages/Settings';
import Evidence from './pages/Evidence';
import Research from './pages/Research';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="cases" element={<Cases />} />
        <Route path="documents" element={<DocumentGenerate />} />
        <Route path="search" element={<Search />} />
        <Route path="templates" element={<Templates />} />
        <Route path="evidence" element={<Evidence />} />
        <Route path="research" element={<Research />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
