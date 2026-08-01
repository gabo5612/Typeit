import { Pause, Play, Square } from 'lucide-react';
import { formatearAtajo } from '../../shared/atajos';
import { formatearDuracion, formatearNumero } from '../formato';

/**
 * Barra flotante que reemplaza a la ventana completa mientras Typeit esta
 * armado o escribiendo. Mientras teclea es click-through (lo fija el main), asi
 * que los botones solo son usables en armado/pausado - por eso el texto insiste
 * con el atajo y con Esc.
 */
export default function Compacto({ estado, config, plataforma, cuentaMs, acciones }) {
  const atajo = formatearAtajo(config.atajo, plataforma);
  const pct = estado.total ? Math.round((estado.escritas / estado.total) * 100) : 0;

  let titulo;
  if (cuentaMs > 0) titulo = 'Arrancando...';
  else if (estado.estado === 'armado') titulo = `Clic en el campo, luego ${atajo}`;
  else if (estado.estado === 'escribiendo') titulo = 'Escribiendo...';
  else if (estado.estado === 'pausado') titulo = 'En pausa';
  else titulo = 'Listo';

  return (
    <div className="compacto">
      <div className="compacto-fila">
        <span className={`estado-dot ${estado.estado}`} />
        <span className="compacto-titulo">{titulo}</span>
        {estado.estado === 'escribiendo' && (
          <button className="btn btn-secondary btn-sm" onClick={acciones.pausar}>
            <Pause size={13} /> Pausar
          </button>
        )}
        {estado.estado === 'pausado' && (
          <button className="btn btn-primary btn-sm" onClick={acciones.reanudar}>
            <Play size={13} /> Seguir
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={acciones.detener} title="Detener (Esc)">
          <Square size={13} />
        </button>
      </div>

      <div className="progress">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="compacto-fila">
        <span className="compacto-cifra">
          {formatearNumero(estado.escritas)} / {formatearNumero(estado.total)} teclas
        </span>
        <span className="compacto-cifra" style={{ marginLeft: 'auto' }}>
          faltan {formatearDuracion(estado.restanteMs)}
        </span>
      </div>
    </div>
  );
}
