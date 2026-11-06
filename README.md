# Lista de precios - Super Carnes El Colorado

La aplicación requiere un servidor Node.js. Los productos se guardan en Cloud
Firestore cifrados con AES-256-GCM antes de salir del servidor. Solo el
administrador puede editarlos. Las tabletas se vinculan con códigos de un solo
uso, y los cambios se transmiten en tiempo real a las tabletas autorizadas.

## Configurar Firebase y la contraseña

La clave de Firebase no se pega en la página, en GitHub ni en el código. Se
guarda en un JSON privado fuera del proyecto; el asistente guarda únicamente la
ruta de ese JSON en `.env`, junto con una contraseña cifrada mediante hash y
claves aleatorias para las sesiones y el cifrado del catálogo.

1. Revoca cualquier clave de cuenta de servicio que se haya compartido. Crea
   una nueva en Google Cloud y guárdala, por ejemplo, en
   `C:\Users\TU_USUARIO\Documents\firebase-secrets\firebase-adminsdk.json`.
   No guardes ese archivo en la carpeta de la aplicación ni en el repositorio.
2. En Firebase, habilita Cloud Firestore. Configura `firestore.rules` para
   denegar el acceso directo desde clientes. Mantén la clave de cuenta de
   servicio segura; el Admin SDK la usa para que el servidor acceda a Firestore.
3. Abre PowerShell en la carpeta de la aplicación e instala dependencias:
   `npm install`
4. Ejecuta el asistente:
   `npm run setup`
   Cuando lo solicite, pega la **ruta del archivo JSON** que guardaste fuera del
   proyecto, no el contenido del archivo. Después crea y confirma la contraseña
   de administrador; al escribirla no aparecerá en pantalla.
5. El asistente crea `.env` automáticamente en esta carpeta. No lo subas a
   GitHub ni lo compartas. La clave JSON tampoco se sube. Luego inicia la app:
   `npm start`

Si `.env` ya existe, el asistente no lo sobrescribe. La app confirma al
administrador y conecta a Firebase usando la ruta privada de la clave.

## Publicar desde GitHub en un servicio Node.js

GitHub guarda el código, pero GitHub Pages no ejecuta `server.js`. Para que la
app se conecte a Firebase y funcione desde otras tabletas, despliega el
repositorio en un servicio Node.js (por ejemplo Render, Railway u otro) que
permita variables privadas de entorno:

1. Crea un servicio web desde tu repositorio de GitHub. Usa `npm install` para
   instalar y `npm start` como comando de inicio; Node.js debe ser versión 20 o
   posterior.
2. En la configuración del servicio, abre **Environment Variables / Secrets**.
   Agrega `FIREBASE_PROJECT_ID` con el ID del proyecto y
   `FIREBASE_SERVICE_ACCOUNT_JSON` con el contenido completo del JSON de una
   cuenta de servicio nueva. Este campo es un secreto del servicio: no lo
   agregues a GitHub, a GitHub Pages, al código ni a un archivo del repositorio.
3. Genera localmente una clave de cifrado con
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`
   y una clave de sesión con
   `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`.
   Agrégalas al servicio como `DATA_ENCRYPTION_KEY` y `SESSION_SECRET`.
4. Genera el hash de la contraseña del administrador en tu terminal con
   `npm run create-admin-hash`. Agrega la línea `ADMIN_PASSWORD_HASH=...` que
   imprime como variable privada del servicio. No compartas la contraseña ni el
   hash.
5. Configura `NODE_ENV=production`, guarda las variables e inicia o despliega el
   servicio. Abre la URL HTTPS que te dé el proveedor. En Render, GitHub es solo
   la fuente del código y los secretos se configuran en **Environment → Add
   Environment Variable**, no en la configuración del repositorio.

En Firebase habilita Cloud Firestore y asigna a la cuenta de servicio solo los
permisos necesarios para leer y escribir datos de Firestore. No habilites acceso
directo desde el navegador. Si una clave privada ya se compartió, revócala y
crea una nueva antes de configurar el servicio. Nunca pegues la clave en el chat.

La aplicación queda disponible en `http://localhost:3000` para uso local. No
expongas esta dirección por internet ni uses HTTP en una red compartida. Para
acceso desde otras tabletas, despliega el servidor detrás de HTTPS y configura
`NODE_ENV=production`. Si usas un proxy HTTPS, configura también
`TRUST_PROXY=1`.

## Autorizar tabletas

1. Abre la aplicación como administrador e inicia sesión con la contraseña.
2. Selecciona **Vincular tableta** y copia el código de un solo uso.
3. En cada tableta, abre la aplicación, introduce el código y asigna un nombre.
   El código vence en 15 minutos y solo se utiliza una vez.
4. En **Tabletas autorizadas** puedes revocar el acceso de una tableta perdida
   o que ya no pertenezca al negocio.

Los clientes que no usen una tableta vinculada no pueden consultar los precios.
El administrador puede entrar desde su dispositivo con su contraseña. No se
guarda la contraseña en Firestore: el servidor verifica un hash scrypt.

## Cifrado y copias de seguridad

El servidor cifra la lista completa con AES-256-GCM antes de escribirla en
Firestore. La clave de cifrado se guarda solo en `.env`; perderla impide
descifrar los datos existentes. Guárdala en un gestor de secretos o respaldo
seguro, nunca en el repositorio. Firestore también cifra datos en reposo y las
conexiones HTTPS protegen los datos durante el transporte.

Las reglas de Firestore bloquean el acceso de clientes. El servidor usa Firebase
Admin SDK y las reglas de Firestore no reemplazan la seguridad de las credenciales
del servidor. Mantén fuera del repositorio `.env`, claves de servicio y respaldos.
