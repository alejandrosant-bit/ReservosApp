// ============================================================
// Proyecto de Firebase de Reservo: reservoapp-d0cca (independiente de Prestahelp).
// Valores de Firebase Console → Configuración del proyecto → Tus apps → Web.
// ============================================================
export const firebaseConfig = {
  apiKey: "AIzaSyB8TdEbOe2RFntDB2dZxk8Oq-4iQTcpqlQ",
  authDomain: "reservoapp-d0cca.firebaseapp.com",
  projectId: "reservoapp-d0cca",
  storageBucket: "reservoapp-d0cca.firebasestorage.app",
  messagingSenderId: "1098645439832",
  appId: "1:1098645439832:web:affb63c98058ed3dc5512d",
  measurementId: "G-YZW4Y21GJ0",
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
