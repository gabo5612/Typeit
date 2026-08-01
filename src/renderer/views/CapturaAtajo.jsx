import { useState } from 'react';
import { Keyboard } from 'lucide-react';
import { acceleratorDesdeEvento, formatearAtajo } from '../../shared/atajos';

/**
 * Campo que "escucha" una combinacion de teclas y la guarda como accelerator.
 * No es un <input> de texto: el usuario hace clic y presiona el atajo que
 * quiera, igual que en cualquier app que deja rebindear teclas.
 */
export default function CapturaAtajo({ valor, plataforma, onCambio, disabled }) {
  const [capturando, setCapturando] = useState(false);
  const [error, setError] = useState(null);

  const manejarTecla = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Escape sale del modo captura sin cambiar nada (no se puede usar como
    // atajo: es el freno de emergencia mientras se escribe).
    if (e.key === 'Escape') {
      setCapturando(false);
      setError(null);
      return;
    }
    if (['Control', 'Shift', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;

    const resultado = acceleratorDesdeEvento(e);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    setError(null);
    setCapturando(false);
    onCambio(resultado.accelerator);
  };

  return (
    <div className="field">
      <label className="label">Tecla para empezar a escribir</label>
      <button
        type="button"
        className={`input kbd-capture${capturando ? ' capturando' : ''}`}
        disabled={disabled}
        onClick={() => { setCapturando(true); setError(null); }}
        onBlur={() => setCapturando(false)}
        onKeyDown={capturando ? manejarTecla : undefined}
      >
        {capturando ? 'Presiona la combinacion...' : formatearAtajo(valor, plataforma) || 'Sin atajo'}
      </button>
      {error
        ? <p className="hint" style={{ color: 'var(--color-danger)' }}>{error}</p>
        : (
          <p className="hint">
            <Keyboard size={12} style={{ verticalAlign: '-2px' }} /> Funciona aunque Typeit este en segundo plano.
            Mientras escribe, esta misma tecla pausa y <span className="kbd">Esc</span> corta todo.
          </p>
        )}
    </div>
  );
}
