import { Connect, PluginOption, ViteDevServer } from "vite";
import { IncomingMessage, ServerResponse } from "http";
import path from "node:path";
import { writeFileSync, watchFile } from "node:fs";
import { build } from "esbuild";

export type MockApiPluginOptions = {
  mockFilesDir?: string;
  middlewares?: Connect.NextHandleFunction[];
};

export interface MockApiPlugin {
  (): PluginOption;
  (options?: MockApiPluginOptions): PluginOption;
}

export type MockApiHandlerRequest = IncomingMessage & {
  params?: { [key: string]: string };
  query?: { [key: string]: string };
  body?: any;
};

export type MockApiHandlerResponse = ServerResponse<IncomingMessage>;

export type MockHandler = {
  path: string;
  handler: (req: MockApiHandlerRequest, res: MockApiHandlerResponse) => void;
};

const getMergedHandlerRequest = (req: MockApiHandlerRequest) => {
  const { body } = req;
  const originUrl = (req.headers.origin || "http://localhost:5173") + req.url;
  const search = new URL(originUrl).search || "";

  const searchParams = new URLSearchParams(search);
  const paramKeys = Array.from(searchParams.keys());

  const handlerParams: { [key: string]: string } = {};
  if (paramKeys.length) {
    for (const key of paramKeys) {
      const paramValue = searchParams.get(key);
      if (paramValue) {
        handlerParams[key] = paramValue;
      }
    }
  }

  const mergedRequest = {
    ...req,
    headers: req.headers,
    query: handlerParams,
    params: handlerParams,
    body,
  } as MockApiHandlerRequest;

  return mergedRequest;
};

export function setJSON(res: ServerResponse<IncomingMessage>, json:object) {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(json));
}

const setHandlerInMiddleware = async (
  server: ViteDevServer,
  mockFilesDir: MockApiPluginOptions["mockFilesDir"]
) => {
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

  const handlersModule = (await import(
    `${path.join(mockDir, "index.cjs")}`
  )) as {
    default: MockHandler[] | { default: MockHandler[] };
  };

  let handlers = handlersModule.default;
  if ("default" in handlers) {
    handlers = handlers.default;
  }

  for (const { path: apiPath, handler: apiHandler } of handlers) {
    server.middlewares.use(apiPath, (req, res) => {
      const [handlerReq, handlerRes] = [
        getMergedHandlerRequest(req),
        res,
      ];

      return apiHandler(handlerReq, handlerRes);
    });
  }
};

const mockFileWatcher = async (
  server: ViteDevServer,
  mockFilesDir: MockApiPluginOptions["mockFilesDir"]
) => {
  setHandlerInMiddleware(server, mockFilesDir);
};

const setMockHandlers = async (
  server: ViteDevServer,
  options?: MockApiPluginOptions
) => {
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
  } catch (err) {
    console.error(`Cannot set mock handlers.`);
    console.error(err);
  }
};

const mockApiPlugin: MockApiPlugin = (...args) => {
  const options = (args[0] as MockApiPluginOptions | undefined) || undefined;

  return {
    name: "vite-mock-api",
    apply: (config) => {
      return config.mode === "development";
    },
    configureServer: async (server: ViteDevServer) => {
      try {
        await setMockHandlers(server, options);
      } catch (err) {
        console.error(err);
      }
    },
  };
};
export default mockApiPlugin;
