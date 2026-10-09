// Quién es administrador de Reservo (el equipo que da de alta los
// negocios). Se puede cambiar en Netlify con la variable ADMIN_EMAILS
// (varios correos separados por coma); si no está, se usa el de abajo.
// Debe coincidir con correoAdmin de public/firebase-config.js y con
// esAdmin() de firestore.rules.
const POR_DEFECTO = "alejandrosant2001@gmail.com";

export const correosAdmin = () =>
  (process.env.ADMIN_EMAILS || POR_DEFECTO)
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

// token = ID token ya verificado por firebase-admin
export const esAdmin = (token) => Boolean(token?.email) && correosAdmin().includes(String(token.email).toLowerCase());

// Negocio sobre el que actúa la llamada: el propio, o el que el
// administrador está revisando.
export const negocioDe = (token, pedido) => (esAdmin(token) && pedido ? String(pedido) : token.uid);
