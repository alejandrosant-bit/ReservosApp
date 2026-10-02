// ============================================================
// Proyecto de Firebase de Reservo: reservoapp-d0cca (independiente de Prestahelp).
// Configuración de Firebase — REEMPLAZA estos valores por los de
// tu proyecto (Firebase Console → Configuración del proyecto →
// Tus apps → Web). Ver README.md, paso 1.
// ============================================================
export const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "reservoapp-d0cca.firebaseapp.com",
  projectId: "reservoapp-d0cca",
  storageBucket: "reservoapp-d0cca.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000",
};

// Clave para notificaciones push (Firebase Console → Configuración
// del proyecto → Cloud Messaging → Certificados push web → "Generar
// par de claves"). Sin esta clave la app funciona igual, pero no
// llegan notificaciones con la app cerrada.
export const vapidKey = "";

// true = cualquiera puede crear su cuenta desde la pantalla de
// entrada (útil si vendes el sistema a varios negocios).
// false = solo tú creas las cuentas en Firebase → Authentication.
export const permitirRegistro = true;
