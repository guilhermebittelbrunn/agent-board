/** biome-ignore-all lint/suspicious/noExplicitAny: Axios interceptor typing */

import { HTTP_STATUS } from "@repo/shared/utils";
import FormattedError from "@repo/shared/utils/helpers/formattedError";
import axios, {
    type AxiosInstance,
    type AxiosRequestConfig,
    type AxiosResponse,
} from "axios";
export type Project = "app" | "web" | "api";

export type Config = {
    project: Project;
    url: string;
};

export default class BaseClient {
    config: Config;

    restClient: AxiosInstance;

    constructor(config: Config) {
        this.config = config;
        this.restClient = axios.create({ baseURL: this.config.url });
    }

    /**
     * The axios error is propagated untouched: only the caller knows the active locale,
     * and it is the caller that turns `error.code` into copy. Formatting here would fix
     * the language at import time and hide the response from whoever needs it.
     */
    request<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
        return this.restClient.request<T>(config);
    }

    setInterceptorError(callback: (error: FormattedError) => void) {
        this.restClient.interceptors.response.use(
            (response: AxiosResponse) => response,
            (error: any) => {
                if (error.response?.status === HTTP_STATUS.UNAUTHORIZED) {
                    callback(new FormattedError(error));
                }
                return Promise.reject(error);
            }
        );
    }

    setHeader(key: string, value: string): void {
        this.restClient.defaults.headers.common[key] = value;
    }

    setHeaders(headers: Record<string, string>): void {
        for (const header in headers) {
            if (Object.hasOwn(headers, header)) {
                this.setHeader(header, headers[header]);
            }
        }
    }

    setAuthorizationHeader(token: string): void {
        this.setHeader("Authorization", `Bearer ${token}`);
    }

    removeHeader(key: string): void {
        delete this.restClient.defaults.headers.common[key];
    }
}
