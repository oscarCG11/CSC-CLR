const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const root = __dirname;
const envPath = path.join(root, ".env");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== "function") {
      reject(new Error("Ejecuta este asistente en una terminal interactiva."));
      return;
    }

    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    let value = "";

    function finish(result) {
      input.removeListener("data", onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write("\n");
      resolve(result);
    }

    function onData(chunk) {
      for (const character of chunk) {
        if (character === "\u0003") {
          input.removeListener("data", onData);
          input.setRawMode(false);
          input.pause();
          process.stdout.write("\nConfiguración cancelada.\n");
          reject(new Error("Cancelado."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else if (character >= " ") {
          value += character;
        }
      }
    }

    input.on("data", onData);
  });
}

function isInsideProject(filePath) {
  const relative = path.relative(root, filePath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function main() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Abre PowerShell o una terminal y ejecuta npm run setup de forma interactiva.");
  }
  if (fs.existsSync(envPath)) {
    throw new Error("Ya existe .env y no se sobrescribió. Respáldalo y cámbiale el nombre si quieres configurarlo de nuevo.");
  }

  const credentialInput = (await question(
    "Ruta completa al JSON nuevo de cuenta de servicio (fuera de esta carpeta): "
  )).trim().replace(/^["']|["']$/g, "");
  rl.close();
  const credentialPath = path.resolve(credentialInput);

  if (isInsideProject(credentialPath)) {
    throw new Error("Guarda el JSON de Firebase fuera de la carpeta de la aplicación y del repositorio.");
  }
  if (!fs.existsSync(credentialPath) || !fs.statSync(credentialPath).isFile()) {
    throw new Error("No se encontró el archivo en esa ruta.");
  }

  let credential;
  try {
    credential = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
  } catch {
    throw new Error("El archivo seleccionado no es un JSON válido.");
  }
  if (
    credential.type !== "service_account" ||
    typeof credential.project_id !== "string" ||
    !/^[a-z0-9][a-z0-9-]{4,28}[a-z0-9]$/.test(credential.project_id) ||
    typeof credential.private_key !== "string" ||
    typeof credential.client_email !== "string"
  ) {
    throw new Error("El archivo debe ser una clave válida de cuenta de servicio Firebase/Google.");
  }

  console.log(`Proyecto detectado: ${credential.project_id}`);
  let password = await readHidden("Crea la contraseña del administrador (mínimo 12 caracteres): ");
  if (password.length < 12) throw new Error("La contraseña debe tener al menos 12 caracteres.");
  let confirmation = await readHidden("Confirma la contraseña: ");
  if (password !== confirmation) throw new Error("Las contraseñas no coinciden.");
  confirmation = "";

  const salt = crypto.randomBytes(16);
  const passwordHash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      password = "";
      if (error) reject(error);
      else resolve(`${salt.toString("hex")}:${derivedKey.toString("hex")}`);
    });
  });

  const env = [
    "NODE_ENV=development",
    "PORT=3000",
    `FIREBASE_PROJECT_ID=${credential.project_id}`,
    `GOOGLE_APPLICATION_CREDENTIALS=${JSON.stringify(credentialPath.replace(/\\/g, "/"))}`,
    `DATA_ENCRYPTION_KEY=${crypto.randomBytes(32).toString("base64")}`,
    `SESSION_SECRET=${crypto.randomBytes(48).toString("base64url")}`,
    `ADMIN_PASSWORD_HASH=${passwordHash}`,
    ""
  ].join("\n");

  fs.writeFileSync(envPath, env, { encoding: "utf8", flag: "wx", mode: 0o600 });
  console.log("\nConfiguración creada en .env. Este archivo está excluido de GitHub.");
  console.log("No compartas .env ni la clave JSON. Ahora ejecuta: npm start");
}

main()
  .catch(error => {
    if (error.message !== "Cancelado.") console.error(`\nNo se completó la configuración: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
