import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SSEProvider } from './context/SSEContext';
import { ThemeProvider } from './context/ThemeContext';
import { Layout } from './components/Layout';
import { Overview } from './pages/Overview';
import { Runs } from './pages/Runs';
import { RunDetail } from './pages/RunDetail';
import { Cost } from './pages/Cost';

export default function App() {
  return (
    <ThemeProvider>
      <SSEProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Overview />} />
              <Route path="runs" element={<Runs />} />
              <Route path="runs/:id" element={<RunDetail />} />
              <Route path="cost" element={<Cost />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SSEProvider>
    </ThemeProvider>
  );
}
