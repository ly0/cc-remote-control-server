const timestamp = () => new Date().toISOString();

export const logger = {
  info(tag: string, msg: string, ...args: any[]) {
    console.log(`[${timestamp()}] [${tag}] ${msg}`, ...args);
  },
  warn(tag: string, msg: string, ...args: any[]) {
    console.warn(`[${timestamp()}] [${tag}] ${msg}`, ...args);
  },
  error(tag: string, msg: string, ...args: any[]) {
    console.error(`[${timestamp()}] [${tag}] ${msg}`, ...args);
  },
  debug(tag: string, msg: string, ...args: any[]) {
    if (process.env.DEBUG) {
      console.debug(`[${timestamp()}] [${tag}] ${msg}`, ...args);
    }
  },
};
