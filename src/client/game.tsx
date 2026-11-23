import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { GamePage } from './game/GamePage';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <GamePage />
    </StrictMode>
  );
}
