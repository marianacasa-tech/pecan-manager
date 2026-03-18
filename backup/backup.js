// backup/backup.js
// Script de backup automático — Pecan Manager

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ── Diagnóstico de variables de entorno ──────────────────────────────────────
const projectId   = process.env.FIREBASE_PROJECT_ID   || '';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
const privateKey  = process.env.FIREBASE_PRIVATE_KEY  || '';

console.log('🔍 Diagnóstico de credenciales:');
console.log(`   FIREBASE_PROJECT_ID:   ${projectId   ? '✅ presente ('+projectId+')' : '❌ VACÍO'}`);
console.log(`   FIREBASE_CLIENT_EMAIL: ${clientEmail ? '✅ presente' : '❌ VACÍO'}`);
console.log(`   FIREBASE_PRIVATE_KEY:  ${privateKey  ? '✅ presente ('+privateKey.length+' chars)' : '❌ VACÍO'}`);

if (!projectId || !clientEmail || !privateKey) {
  console.error('\n❌ Faltan credenciales. Verificar los secrets en GitHub.');
  process.exit(1);
}

// ── Inicializar Firebase Admin ───────────────────────────────────────────────
admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   projectId,
    clientEmail: clientEmail,
    privateKey:  privateKey.replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();

// ── Colecciones a exportar ───────────────────────────────────────────────────
const COLECCIONES = [
  'clientes', 'proveedores',
  'entradas_fabrica', 'salidas_fabrica',
  'retiros_maquila', 'liquidaciones_maquila',
  'recetas', 'insumos', 'tandas_cocina',
  'compras', 'compras_nuez',
  'ventas', 'cobros', 'config', 'pagos_usd',
];

// ── Función principal ────────────────────────────────────────────────────────
async function runBackup() {
  const fechaISO   = new Date().toISOString();
  const fechaCorta = fechaISO.slice(0, 10);

  console.log(`\n🌰 Pecan Manager — Backup automático`);
  console.log(`📅 Fecha: ${fechaISO}\n`);

  const backup = {
    meta: {
      fecha:         fechaISO,
      fecha_legible: new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
      version:       '1.0',
      app:           'Pecan Manager',
      tipo:          'automatico',
    },
    colecciones: {},
  };

  let totalRegistros = 0;

  for (const colNombre of COLECCIONES) {
    try {
      const snap = await db.collection(colNombre).get();
      backup.colecciones[colNombre] = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        const clean = { _id: docSnap.id };
        Object.entries(data).forEach(([k, v]) => {
          clean[k] = (v && typeof v.toDate === 'function') ? v.toDate().toISOString() : v;
        });
        backup.colecciones[colNombre].push(clean);
      });
      totalRegistros += snap.size;
      console.log(`  ✅ ${colNombre.padEnd(25)} ${snap.size} registros`);
    } catch (err) {
      console.log(`  ⚠️  ${colNombre.padEnd(25)} ERROR: ${err.message}`);
      backup.colecciones[colNombre] = [];
    }
  }

  const dirBackups = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(dirBackups)) fs.mkdirSync(dirBackups, { recursive: true });

  fs.writeFileSync(path.join(dirBackups, `backup-${fechaCorta}.json`), JSON.stringify(backup, null, 2), 'utf8');
  fs.writeFileSync(path.join(dirBackups, 'backup-latest.json'),        JSON.stringify(backup, null, 2), 'utf8');

  // Limpiar backups con más de 30 días
  const archivos = fs.readdirSync(dirBackups)
    .filter(f => f.match(/^backup-\d{4}-\d{2}-\d{2}\.json$/))
    .sort();
  if (archivos.length > 30) {
    archivos.slice(0, archivos.length - 30).forEach(f => {
      fs.unlinkSync(path.join(dirBackups, f));
      console.log(`  🗑️  Eliminado backup viejo: ${f}`);
    });
  }

  console.log(`\n✅ Backup completado — ${totalRegistros} registros totales`);
}

runBackup().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
