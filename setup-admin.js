const crypto = require("node:crypto");
const readline = require("node:readline");

if (!process.stdin.isTTY) {
  console.error("Ejecuta este comando desde una terminal interactiva.");
  process.exit(1);
}

const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
const stdin = process.stdin;
const stdout = process.stdout;
let password = "";

stdout.write("Crea una contraseña de administrador (mínimo 12 caracteres): ");
stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding("utf8");

stdin.on("data", chunk => {
  for (const character of chunk) {
    if (character === "\u0003") {
      stdout.write("\nCancelado.\n");
      process.exit(130);
    }
    if (character === "\r" || character === "\n") {
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (password.length < 12) {
        console.error("La contraseña debe tener al menos 12 caracteres.");
        terminal.close();
        process.exitCode = 1;
        return;
      }

      const salt = crypto.randomBytes(16);
      crypto.scrypt(password, salt, 64, (error, derivedKey) => {
        password = "";
        if (error) {
          console.error("No se pudo generar el hash de la contraseña.", error);
          process.exitCode = 1;
        } else {
          console.log(`ADMIN_PASSWORD_HASH=${salt.toString("hex")}:${derivedKey.toString("hex")}`);
        }
        terminal.close();
      });
      return;
    }
    if (character === "\u007f" || character === "\b") {
      password = password.slice(0, -1);
    } else if (character >= " ") {
      password += character;
    }
  }
});
