import { Dashboard } from './components/Dashboard';
import { useResolvedTheme } from './theme';

export function App() {
  useResolvedTheme();
  return <Dashboard />;
}
