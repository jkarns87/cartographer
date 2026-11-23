import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { GamePage } from './game/GamePage';
import { Sprite } from './icons/Sprite';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Sprite />
      <GamePage />
    </StrictMode>
  );
}
