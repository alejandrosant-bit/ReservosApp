// Conexión de las Netlify Functions a Firebase con permisos de
// administrador (Service Account). La clave NUNCA va en el código:
// se pega en Netlify → Site configuration → Environment variables
// como FIREBASE_SERVICE_ACCOUNT (el JSON completo, o en base64).
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

function leerCredenciales() {
  const crudo = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  if (!crudo) throw new Error("Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT");
  const json = crudo.trim().startsWith("{") ? crudo : Buffer.from(crudo, "base64").toString("utf8");
  return JSON.parse(json);
}

export function firebase() {
  if (!getApps().length) initializeApp({ credential: cert(leerCredenciales()) });
  return { db: getFirestore(), messaging: getMessaging(), FieldValue };
}
