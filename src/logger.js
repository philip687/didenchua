const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function timestamp() {
  const d = new Date();
  return d.toTimeString().split(' ')[0];
}

export const log = {
  info: (msg, ...args) => console.log(`${COLORS.dim}[${timestamp()}]${COLORS.reset} ℹ️  ${msg}`, ...args),
  success: (msg, ...args) => console.log(`${COLORS.dim}[${timestamp()}]${COLORS.reset} ${COLORS.green}✅ ${msg}${COLORS.reset}`, ...args),
  warn: (msg, ...args) => console.log(`${COLORS.dim}[${timestamp()}]${COLORS.reset} ${COLORS.yellow}⚠️  ${msg}${COLORS.reset}`, ...args),
  error: (msg, ...args) => console.error(`${COLORS.dim}[${timestamp()}]${COLORS.reset} ${COLORS.red}❌ ${msg}${COLORS.reset}`, ...args),
  temple: (icon, msg, ...args) => console.log(`${COLORS.dim}[${timestamp()}]${COLORS.reset} ${COLORS.bright}${icon} ${msg}${COLORS.reset}`, ...args),
  merit: (msg, ...args) => console.log(`${COLORS.dim}[${timestamp()}]${COLORS.reset} ${COLORS.yellow}✨ [CÔNG ĐỨC]${COLORS.reset} ${msg}`, ...args)
};

