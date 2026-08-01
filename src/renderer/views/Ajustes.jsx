import { Gauge, Sparkles } from 'lucide-react';
import CapturaAtajo from './CapturaAtajo.jsx';
import { formatearDuracion } from '../formato';

// Referencias de velocidad para que el numero de wpm signifique algo.
function etiquetaVelocidad(wpm) {
  if (wpm < 25) return 'Lento (buscando las teclas)';
  if (wpm < 40) return 'Normal, sin apuro';
  if (wpm < 60) return 'Mecanografia comoda';
  if (wpm < 90) return 'Rapido';
  return 'Muy rapido (puede verse artificial)';
}

export default function Ajustes({ config, plataforma, onCambio, bloqueado, estimacionMs }) {
  const set = (patch) => onCambio(patch);

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title"><Gauge size={16} /> Ajustes</h2>
        {estimacionMs > 0 && (
          <span className="badge badge-neutral">Tardaria ~{formatearDuracion(estimacionMs)}</span>
        )}
      </div>

      <CapturaAtajo
        valor={config.atajo}
        plataforma={plataforma}
        disabled={bloqueado}
        onCambio={(atajo) => set({ atajo })}
      />

      <div className="field">
        <label className="label">Velocidad: {config.wpm} palabras/min</label>
        <input
          type="range"
          min="10"
          max="140"
          step="1"
          value={config.wpm}
          disabled={bloqueado}
          onChange={(e) => set({ wpm: Number(e.target.value) })}
        />
        <p className="hint">{etiquetaVelocidad(config.wpm)}</p>
      </div>

      <div className="field">
        <label className="label">Variacion entre teclas: {Math.round(config.variacion * 100)}%</label>
        <input
          type="range"
          min="0"
          max="80"
          step="1"
          value={Math.round(config.variacion * 100)}
          disabled={bloqueado}
          onChange={(e) => set({ variacion: Number(e.target.value) / 100 })}
        />
        <p className="hint">
          En 0% cada tecla cae exactamente cada X ms: es el patron que delata a un bot. 35% es lo normal en una persona.
        </p>
      </div>

      <div className="field">
        <label className="label">Errores y correcciones: {config.errores}%</label>
        <input
          type="range"
          min="0"
          max="6"
          step="0.5"
          value={config.errores}
          disabled={bloqueado}
          onChange={(e) => set({ errores: Number(e.target.value) })}
        />
        <p className="hint">
          Cada tanto teclea una letra vecina, la borra con backspace y sigue. 0% lo desactiva.
        </p>
      </div>

      <div className="field">
        <label className="label">Espera despues del atajo: {config.retrasoInicioMs} ms</label>
        <input
          type="range"
          min="0"
          max="3000"
          step="100"
          value={config.retrasoInicioMs}
          disabled={bloqueado}
          onChange={(e) => set({ retrasoInicioMs: Number(e.target.value) })}
        />
        <p className="hint">Margen para soltar la tecla antes de la primera letra.</p>
      </div>

      <div className="field">
        <label className="switch-row">
          <input
            type="checkbox"
            checked={config.pausas}
            disabled={bloqueado}
            onChange={(e) => set({ pausas: e.target.checked })}
          />
          <span className="switch-text">
            <strong><Sparkles size={12} style={{ verticalAlign: '-1px' }} /> Pausas naturales</strong>
            <span>Frena mas despues de punto, coma y salto de linea, y de vez en cuando se detiene a &quot;pensar&quot;.</span>
          </span>
        </label>
      </div>

      <div className="field">
        <label className="switch-row">
          <input
            type="checkbox"
            checked={config.compacto}
            disabled={bloqueado}
            onChange={(e) => set({ compacto: e.target.checked })}
          />
          <span className="switch-text">
            <strong>Barra flotante mientras escribe</strong>
            <span>Encoge Typeit a una barra arriba a la derecha para no tapar el campo destino.</span>
          </span>
        </label>
      </div>
    </div>
  );
}
