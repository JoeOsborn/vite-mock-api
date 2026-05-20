import path from "node:path";
import { writeFileSync, watchFile } from "node:fs";
import { build } from "esbuild";
export function setJSON(res, json) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(json));
}
const setHandlerInMiddleware = async (server, mockFilesDir) => {
    const mockDir = path.join(server.config.root, mockFilesDir);
    const mockRootFile = path.join(mockDir, "index.ts");
    const result = await build({
        entryPoints: [mockRootFile],
        write: false,
        platform: "node",
        bundle: true,
        format: "cjs",
        metafile: true,
        target: "es2015",
    });
    const { text } = result.outputFiles[0];
    writeFileSync(`${mockDir}/index.cjs`, text);
    const handlersModule = (await import(`${path.join(mockDir, "index.cjs")}`));
    let handlers = handlersModule.default;
    if ("default" in handlers) {
        handlers = handlers.default;
    }
    for (const { path: apiPath, handler: apiHandler } of handlers) {
        server.middlewares.use(apiPath, apiHandler);
    }
};
const mockFileWatcher = async (server, mockFilesDir) => {
    setHandlerInMiddleware(server, mockFilesDir);
};
const setMockHandlers = async (server, options) => {
    const { mockFilesDir = "mock-api", middlewares = [] } = options || {
        mockFilesDir: "mock-api",
        middlewares: [],
    };
    try {
        // Setup added third-party library(ex. body-parser) in middleware.
        for (const middleware of middlewares) {
            server.middlewares.use(middleware);
        }
        // Define mock files directory from Plugin option.
        const mockDir = path.join(server.config.root, mockFilesDir);
        const mockRootFile = path.join(mockDir, "index.ts");
        // Setup mock api handler in vite-middleware.
        await setHandlerInMiddleware(server, mockFilesDir);
        // Observe mock handler file, then exec setHandlerInMiddleware().
        watchFile(mockRootFile, () => mockFileWatcher(server, mockFilesDir));
    }
    catch (err) {
        console.error(`Cannot set mock handlers.`);
        console.error(err);
    }
};
const mockApiPlugin = (...args) => {
    const options = args[0] || undefined;
    return {
        name: "vite-mock-api",
        apply: (config) => {
            return config.mode === "development";
        },
        configureServer: async (server) => {
            try {
                await setMockHandlers(server, options);
            }
            catch (err) {
                console.error(err);
            }
        },
    };
};
export default mockApiPlugin;
//# sourceMappingURL=index.js.map