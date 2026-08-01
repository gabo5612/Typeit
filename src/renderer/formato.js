// Helpers de presentacion compartidos por las vistas. Es CommonJS a proposito
// (igual que en QuickTask2.0): asi webpack lo empaqueta para el renderer y los
// tests de node pueden probarlo sin montar React.

/** 95000 -> "1 min 35 s" | 8400 -> "8,4 s" | 400 -> "<1 s" */
function formatearDuracion(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0 s';
  if (ms < 1000) return '<1 s';
  const totalSeg = ms / 1000;
  if (totalSeg < 60) {
    const seg = totalSeg < 10 ? totalSeg.toFixed(1).replace('.', ',') : String(Math.round(totalSeg));
    return `${seg} s`;
  }
  const min = Math.floor(totalSeg / 60);
  const seg = Math.round(totalSeg % 60);
  if (seg === 0) return `${min} min`;
  return `${min} min ${seg} s`;
}

/** 1234 -> "1.234" (separador de miles es-VE) */
function formatearNumero(n) {
  return new Intl.NumberFormat('es-VE').format(n);
}

module.exports = { formatearDuracion, formatearNumero };
