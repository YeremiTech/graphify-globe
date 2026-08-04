import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sileo';
import 'sileo/styles.css';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Toaster
      position="top-center"
      theme="dark"
      options={{
        roundness: 10,
        position: 'top-center',
      }}
    />
    <App />
  </StrictMode>,
);
