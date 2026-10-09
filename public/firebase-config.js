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
// false = solo tú creas las cuentas en Firebase → Authentication
// (membresía: quien no tiene cuenta ve un enlace a tu WhatsApp).
export const permitirRegistro = false;

// Correo del equipo de Reservo: al entrar con él se abre el Panel
// (dar de alta negocios, entrar a revisarlos y manejar membresías).
// Debe coincidir con esAdmin() de firestore.rules.
export const correoAdmin = "alejandrosant2001@gmail.com";

// Estilo de la pantalla de entrada para este despliegue:
// "tecno" (oscuro, el de la página de Reservo), "belleza" o "barberia".
// Cada negocio igual puede cambiarlo después en Ajustes → Mi negocio.
export const estiloPorDefecto = "tecno";
