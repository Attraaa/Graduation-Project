import { createRoot } from 'react-dom/client';
import OverlayPanel from './features/overlay/OverlayPanel';
import './index.css';
import './features/overlay/overlay.css';

createRoot(document.getElementById('root')!).render(<OverlayPanel />);
