import { Connect, PluginOption } from "vite";
import { IncomingMessage, ServerResponse } from "http";
export type MockApiPluginOptions = {
    mockFilesDir?: string;
    middlewares?: Connect.NextHandleFunction[];
};
export interface MockApiPlugin {
    (): PluginOption;
    (options?: MockApiPluginOptions): PluginOption;
}
export type MockApiHandlerRequest = IncomingMessage & {
    params?: {
        [key: string]: string;
    };
    query?: {
        [key: string]: string;
    };
    body?: any;
};
export type MockApiHandlerResponse = ServerResponse<IncomingMessage>;
export type MockHandler = {
    path: string;
    handler: (req: MockApiHandlerRequest, res: MockApiHandlerResponse) => void;
};
export declare function setJSON(res: ServerResponse<IncomingMessage>, json: object): void;
declare const mockApiPlugin: MockApiPlugin;
export default mockApiPlugin;
