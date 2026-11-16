import { createRoot } from 'react-dom/client';
import './styles/tokens.css';

const root = createRoot(document.getElementById('root')!);

if (import.meta.env.DEV) {
  void import('./dev/Showcase').then(({ Showcase }) => root.render(<Showcase />));
} else {
  root.render(<p>Perch</p>);
}
