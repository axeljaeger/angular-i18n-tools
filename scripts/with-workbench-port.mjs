import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const separatorIndex = args.indexOf("--");

if (separatorIndex === -1) {
  console.error("Usage: with-workbench-port.mjs [--offset N] [--fallback-port N] -- <command> [...args]");
  process.exit(1);
}

const options = parseOptions(args.slice(0, separatorIndex));
const command = args[separatorIndex + 1];
const commandArgs = args.slice(separatorIndex + 2);

if (!command) {
  console.error("Missing command after --.");
  process.exit(1);
}

const port = selectPort(options);
const expandedArgs = commandArgs.map((arg) => arg.replaceAll("{port}", String(port)));

console.log(`Using port ${port} for ${command}.`);

const child = spawn(command, expandedArgs, {
  env: {
    ...process.env,
    PORT: String(port)
  },
  shell: process.platform === "win32",
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

function parseOptions(optionArgs) {
  const options = {
    offset: 0,
    fallbackPort: 3000
  };

  for (let index = 0; index < optionArgs.length; index += 1) {
    const arg = optionArgs[index];

    if (arg === "--offset") {
      options.offset = parseIntegerOption(arg, optionArgs[++index]);
    } else if (arg.startsWith("--offset=")) {
      options.offset = parseIntegerOption("--offset", arg.slice("--offset=".length));
    } else if (arg === "--fallback-port") {
      options.fallbackPort = parseIntegerOption(arg, optionArgs[++index]);
    } else if (arg.startsWith("--fallback-port=")) {
      options.fallbackPort = parseIntegerOption("--fallback-port", arg.slice("--fallback-port=".length));
    } else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  return options;
}

function parseIntegerOption(name, value) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(parsed)) {
    console.error(`Expected integer value for ${name}.`);
    process.exit(1);
  }

  return parsed;
}

function selectPort({ offset, fallbackPort }) {
  const start = parseOptionalInteger(process.env.CMUX_PORT);

  if (start === undefined) {
    return fallbackPort + offset;
  }

  const end = parseOptionalInteger(process.env.CMUX_PORT_END);
  const range = parseOptionalInteger(process.env.CMUX_PORT_RANGE);
  const port = start + offset;
  const maxPort = end ?? (range === undefined ? start : start + range - 1);

  if (port > maxPort) {
    console.error(`Port offset ${offset} exceeds cmux port range ${start}-${maxPort}.`);
    process.exit(1);
  }

  return port;
}

function parseOptionalInteger(value) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}
