import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ClipboardPaste, Keyboard, Pause, Play, ShieldAlert, Square, Trash2, Type } from 'lucide-react';
import Ajustes from './views/Ajustes.jsx';
import Compacto from './views/Compacto.jsx';
import { formatearAtajo } from '../shared/atajos';
import { estimarDuracionMs } from '../shared/timing';
import { formatearDuracion, formatearNumero } from './formato';

const ESTADO_INICIAL = {
  estado: 'inactivo',
  total: 0,
  escritas: 0,
  restanteMs: 0,
  error: null,
  soportado: true,
  backend: null,
};

const TEXTO_PRUEBA = 'Hola, esto es una prueba de Typeit. Se ve bien?';

export default function App() {
  const [config, setConfig] = useState(null);
  const [info, setInfo] = useState(null);
  const [estado, setEstado] = useState(ESTADO_INICIAL);
  const [permiso, setPermiso] = useState(null);
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState(null);
  // Espera entre el atajo y la primera tecla. El main solo avisa CUANTO va a
  // esperar; la cuenta regresiva se dibuja aca.
  const [cuentaMs, setCuentaMs] = useState(0);
  const refPrueba = useRef(null);

  // --- Carga inicial y suscripciones ---------------------------------------

  const revisarPermiso = useCallback(async () => {
    setPermiso(await window.api.motor.permisos({ pedir: false }));
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [c, i, e, p] = await Promise.all([
        window.api.config.get(),
        window.api.app.info(),
        window.api.motor.estado(),
        window.api.motor.permisos({ pedir: false }),
      ]);
      if (!vivo) return;
      setConfig(c);
      setInfo(i);
      setEstado(e);
      setPermiso(p);
    })();
    return () => { vivo = false; };
  }, []);

  useEffect(() => window.api.on.estado((nuevo) => {
    setEstado(nuevo);
    setCuentaMs(0);
    if (nuevo.error) setAviso({ tono: 'danger', texto: nuevo.error });
  }), []);

  // La cuenta regresiva se descuenta contra el reloj (y no restando 100 ms por
  // tick): si el sistema se traba un instante, el numero sigue siendo el real.
  useEffect(() => {
    let intervalo = null;
    const parar = () => { if (intervalo) { clearInterval(intervalo); intervalo = null; } };
    const off = window.api.on.cuenta(({ ms }) => {
      const fin = Date.now() + ms;
      setCuentaMs(ms);
      parar();
      intervalo = setInterval(() => {
        const restante = Math.max(0, fin - Date.now());
        setCuentaMs(restante);
        if (restante === 0) parar();
      }, 100);
    });
    return () => { off(); parar(); };
  }, []);

  // macOS puede conceder el permiso de Accesibilidad mientras la app corre; se
  // revisa al volver el foco para que el aviso desaparezca solo.
  useEffect(() => {
    const onFocus = () => revisarPermiso();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [revisarPermiso]);

  // --- Derivados ------------------------------------------------------------

  const caracteres = useMemo(() => [...texto].length, [texto]);
  const estimacionMs = useMemo(
    () => (config ? estimarDuracionMs(texto, config) : 0),
    [texto, config],
  );

  if (!config || !info) return <div className="app-shell" />;

  const ocupado = estado.estado !== 'inactivo';
  const atajo = formatearAtajo(config.atajo, info.plataforma);
  const faltaPermiso = permiso && !permiso.concedido;

  // --- Acciones -------------------------------------------------------------

  const acciones = {
    pausar: () => window.api.motor.pausar(),
    reanudar: () => window.api.motor.reanudar(),
    detener: () => window.api.motor.detener(),
  };

  const guardarConfig = async (patch) => {
    const { config: nueva, avisoAtajo } = await window.api.config.set(patch);
    setConfig(nueva);
    if (avisoAtajo) setAviso({ tono: 'warning', texto: avisoAtajo });
  };

  const armar = async () => {
    setAviso(null);
    if (!texto.trim()) {
      setAviso({ tono: 'warning', texto: 'Pega primero el texto que queres escribir.' });
      return;
    }
    const nuevo = await window.api.motor.armar(texto);
    if (nuevo.error) setAviso({ tono: 'danger', texto: nuevo.error });
    else setEstado(nuevo);
  };

  const probar = async () => {
    setAviso(null);
    refPrueba.current?.focus();
    // Un respiro para que el foco quede realmente en el campo antes de que
    // empiecen a llegar las teclas del sistema.
    await new Promise((r) => setTimeout(r, 150));
    await window.api.motor.probar(TEXTO_PRUEBA);
  };

  const pegar = async () => {
    try {
      setTexto(await navigator.clipboard.readText());
    } catch {
      // Sin permiso de portapapeles: no es critico, el usuario pega con Cmd+V.
      setAviso({ tono: 'warning', texto: 'No se pudo leer el portapapeles. Pega con el teclado.' });
    }
  };

  // --- Modo compacto --------------------------------------------------------

  if (ocupado && config.compacto) {
    return (
      <Compacto
        estado={estado}
        config={config}
        plataforma={info.plataforma}
        cuentaMs={cuentaMs}
        acciones={acciones}
      />
    );
  }

  // --- Ventana completa -----------------------------------------------------

  return (
    <div className="app-shell">
      <div className="titlebar-drag" />
      <div className="main-scroll">
        <header className="page-header">
          <div>
            <h1 className="page-title"><Type size={20} /> Typeit</h1>
            <p className="page-subtitle">
              Pega el texto, dale Empezar, hace clic en el campo del sitio y presiona <span className="kbd">{atajo}</span>.
              Typeit lo teclea como si lo escribieras vos.
            </p>
          </div>
        </header>

        {!estado.soportado && (
          <div className="aviso aviso-danger">
            <AlertTriangle size={16} />
            <p>Typeit todavia no tiene motor de teclado para <strong>{info.plataforma}</strong>. Funciona en macOS y Windows.</p>
          </div>
        )}

        {faltaPermiso && (
          <div className="aviso aviso-warning">
            <ShieldAlert size={16} />
            <div>
              <p>{permiso.mensaje}</p>
              <div className="aviso-acciones">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    await window.api.motor.permisos({ pedir: true });
                    revisarPermiso();
                  }}
                >
                  Abrir Ajustes del Sistema
                </button>
                <button className="btn btn-ghost btn-sm" onClick={revisarPermiso}>Ya lo active</button>
              </div>
            </div>
          </div>
        )}

        {aviso && (
          <div className={`aviso aviso-${aviso.tono}`}>
            <AlertTriangle size={16} />
            <p>{aviso.texto}</p>
          </div>
        )}

        <PanelEstado
          estado={estado}
          atajo={atajo}
          cuentaMs={cuentaMs}
          acciones={acciones}
          onDesarmar={() => window.api.motor.desarmar()}
        />

        <div className="card">
          <div className="card-header">
            <h2 className="card-title"><ClipboardPaste size={16} /> Texto a escribir</h2>
            <span className="badge badge-neutral">
              {formatearNumero(caracteres)} caracteres · ~{formatearDuracion(estimacionMs)}
            </span>
          </div>

          <textarea
            className="textarea"
            placeholder="Pega aca el texto..."
            value={texto}
            disabled={ocupado}
            onChange={(e) => setTexto(e.target.value)}
          />

          <div className="estado-acciones" style={{ marginTop: 'var(--space-4)' }}>
            <button className="btn btn-primary btn-lg" onClick={armar} disabled={ocupado || !estado.soportado}>
              <Play size={16} /> Empezar
            </button>
            <button className="btn btn-secondary" onClick={pegar} disabled={ocupado}>
              <ClipboardPaste size={15} /> Pegar
            </button>
            <button className="btn btn-ghost" onClick={() => setTexto('')} disabled={ocupado || !texto}>
              <Trash2 size={15} /> Limpiar
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title"><Keyboard size={16} /> Probar aca mismo</h2>
            <button className="btn btn-secondary btn-sm" onClick={probar} disabled={ocupado || !estado.soportado}>
              Probar
            </button>
          </div>
          <textarea
            ref={refPrueba}
            className="textarea"
            style={{ minHeight: 78 }}
            placeholder="Typeit va a escribir una frase de prueba aca, con la velocidad configurada."
          />
          <p className="hint" style={{ marginTop: 'var(--space-2)' }}>
            Escribe en este campo usando el mismo mecanismo del sistema que usaria en el sitio real:
            si funciona aca, el permiso esta bien dado.
          </p>
        </div>

        <Ajustes
          config={config}
          plataforma={info.plataforma}
          bloqueado={ocupado}
          estimacionMs={estimacionMs}
          onCambio={guardarConfig}
        />

        <div className="pie">
          <span>Typeit {info.version}</span>
          <span>{estado.backend ?? 'sin motor'}</span>
        </div>
      </div>
    </div>
  );
}

/** Franja de estado del motor, con progreso y los controles de la corrida. */
function PanelEstado({ estado, atajo, cuentaMs, acciones, onDesarmar }) {
  if (estado.estado === 'inactivo' && cuentaMs <= 0) return null;

  const pct = estado.total ? Math.round((estado.escritas / estado.total) * 100) : 0;

  let titulo = 'Listo';
  let sub = '';
  if (cuentaMs > 0) {
    titulo = `Arrancando en ${(cuentaMs / 1000).toFixed(1).replace('.', ',')} s`;
    sub = 'No toques nada: el foco tiene que quedarse donde hiciste clic.';
  } else if (estado.estado === 'armado') {
    titulo = 'Armado';
    sub = `Hace clic donde queres el texto y presiona ${atajo}.`;
  } else if (estado.estado === 'escribiendo') {
    titulo = 'Escribiendo';
    sub = `${formatearNumero(estado.escritas)} de ${formatearNumero(estado.total)} teclas · faltan ${formatearDuracion(estado.restanteMs)} · ${atajo} pausa, Esc corta`;
  } else if (estado.estado === 'pausado') {
    titulo = 'En pausa';
    sub = `Freno en la tecla ${formatearNumero(estado.escritas)}. Volve a hacer clic en el campo antes de seguir.`;
  }

  return (
    <div className={`estado-panel ${estado.estado}`}>
      <span className={`estado-dot ${estado.estado}`} />
      <div className="estado-texto">
        <div className="estado-titulo">{titulo}</div>
        <div className="estado-sub">{sub}</div>
        {(estado.estado === 'escribiendo' || estado.estado === 'pausado') && (
          <div className="progress"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
        )}
      </div>
      <div className="estado-acciones">
        {estado.estado === 'armado' && (
          <button className="btn btn-secondary btn-sm" onClick={onDesarmar}>Cancelar</button>
        )}
        {estado.estado === 'escribiendo' && (
          <button className="btn btn-secondary btn-sm" onClick={acciones.pausar}><Pause size={13} /> Pausar</button>
        )}
        {estado.estado === 'pausado' && (
          <button className="btn btn-primary btn-sm" onClick={acciones.reanudar}><Play size={13} /> Seguir</button>
        )}
        {(estado.estado === 'escribiendo' || estado.estado === 'pausado') && (
          <button className="btn btn-danger btn-sm" onClick={acciones.detener}><Square size={13} /> Detener</button>
        )}
      </div>
    </div>
  );
}
