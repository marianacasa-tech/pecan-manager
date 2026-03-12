// backup/backup.js
// Script de backup automático — Pecan Manager
// Se ejecuta desde GitHub Actions con credenciales de Firebase Admin

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ── Inicializar Firebase Admin con credenciales del entorno ──────────────────
admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // GitHub guarda la clave con \n como texto literal — hay que convertirlos
    privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();

// ── Colecciones a exportar ───────────────────────────────────────────────────
const COLECCIONES = [
  'clientes',
  'proveedores',
  'entradas_fabrica',
  'salidas_fabrica',
  'retiros_maquila',
  'liquidaciones_maquila',
  'recetas',
  'insumos',
  'tandas_cocina',
  'compras',
  'compras_nuez',
  'ventas',
  'cobros',
  'config',
];

// ── Función principal ────────────────────────────────────────────────────────
async function runBackup() {
  const fechaISO  = new Date().toISOString();
  const fechaCorta = fechaISO.slice(0, 10); // YYYY-MM-DD

  console.log(`\n🌰 Pecan Manager — Backup automático`);
  console.log(`📅 Fecha: ${fechaISO}\n`);

  const backup = {
    meta: {
      fecha:        fechaISO,
      fecha_legible: new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
      version:      '1.0',
      app:          'Pecan Manager',
      tipo:         'automatico',
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

        // Convertir Timestamps de Firestore a ISO string
        Object.entries(data).forEach(([k, v]) => {
          if (v && typeof v.toDate === 'function') {
            clean[k] = v.toDate().toISOString();
          } else {
            clean[k] = v;
          }
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

  // ── Guardar archivo del día ────────────────────────────────────────────────
  const dirBackups = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(dirBackups)) fs.mkdirSync(dirBackups, { recursive: true });

  const archivoHoy = path.join(dirBackups, `backup-${fechaCorta}.json`);
  fs.writeFileSync(archivoHoy, JSON.stringify(backup, null, 2), 'utf8');

  // ── Actualizar backup "latest" (siempre el más reciente) ──────────────────
  const archivoLatest = path.join(dirBackups, 'backup-latest.json');
  fs.writeFileSync(archivoLatest, JSON.stringify(backup, null, 2), 'utf8');

  // ── Limpiar backups con más de 30 días ────────────────────────────────────
  const archivos = fs.readdirSync(dirBackups)
    .filter(f => f.match(/^backup-\d{4}-\d{2}-\d{2}\.json$/))
    .sort();

  if (archivos.length > 30) {
    const aEliminar = archivos.slice(0, archivos.length - 30);
    aEliminar.forEach(f => {
      fs.unlinkSync(path.join(dirBackups, f));
      console.log(`  🗑️  Eliminado backup viejo: ${f}`);
    });
  }

  console.log(`\n✅ Backup completado — ${totalRegistros} registros en total`);
  console.log(`📁 Archivos guardados:`);
  console.log(`   ${archivoHoy}`);
  console.log(`   ${archivoLatest}`);
  console.log(`📦 Backups almacenados: ${Math.min(archivos.length, 30)} días\n`);
}

runBackup().catch(err => {
  console.error('❌ Error fatal en el backup:', err);
  process.exit(1);
});
