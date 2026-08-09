import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { makeToneSink } from './ui/audio.js';
import './styles.css';

export const mount = (container: HTMLElement): void => {
  const context = new AudioContext();
  createRoot(container).render(
    <StrictMode>
      <App sink={makeToneSink(context)} />
    </StrictMode>,
  );
};

const root = document.getElementById('root');
if (root !== null) {
  mount(root);
}
