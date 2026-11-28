export type SessionUser = { id: string; username: string; nickname: string };

export type DesktopSession = { revision: string; user: SessionUser; token?: never };
export type BrowserSession = { token: string; user: SessionUser; revision?: string };

export type DesktopApiCall = {
  id: string;
  path: string;
  method: string;
  body?: string;
  timeoutMs: number;
  revision: string | null;
};

export type DesktopApiReply = { status: number; data: unknown };

export interface DesktopApi {
  initialize(legacy: BrowserSession | null): Promise<DesktopSession | null>;
  request(call: DesktopApiCall): Promise<DesktopApiReply>;
  cancel(id: string): void;
  logout(revision: string): Promise<void>;
}
