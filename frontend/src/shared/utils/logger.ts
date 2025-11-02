export default class Logger {
    private static debug = false;

    static setDebug(flag: boolean): void {
        Logger.debug = flag;
    }

    static log(...args: any[]): void {
        if (Logger.debug) {
            // eslint-disable-next-line no-console
            console.log(...args);
        }
    }

    static warn(...args: any[]): void {
        if (Logger.debug) {
            // eslint-disable-next-line no-console
            console.warn(...args);
        }
    }

    static error(...args: any[]): void {
        // Always log errors regardless of debug flag
        // eslint-disable-next-line no-console
        console.error(...args);
    }
}

