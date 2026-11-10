// 월드 ↔ 게이트웨이 IPC 주소(env WORLD_IPC) 파서 — 성능 4단계(게이트웨이 분리).
//
// 형식:
//   tcp://<host>:<port>  host = loopback만(127.0.0.0/8 · localhost · [::1]) — IPC는 인증 없는 내부 프로토콜이라
//                        loopback 밖에 열면 아무나 게이트웨이를 자처해 임의 클라 IP로 연결을 열 수 있다(멀티 호스트는 보류).
//   unix:<path>          유닉스 도메인 소켓(Linux·macOS). Windows 거부는 env 가드 몫(플랫폼 의존 — env.ts).
// pipe:(Windows named pipe)는 받지 않는다 — 4.0 실측: Bun/libuv가 내부 큐잉해 write가 항상 전부 수락되므로 월드가
// 백프레셔를 볼 수 없다(IPC_MAX_PENDING_MB 상한이 무력화).

export type IpcAddress =
  | { readonly kind: "tcp"; readonly host: string; readonly port: number }
  | { readonly kind: "unix"; readonly path: string };

/** sockaddr_un.sun_path 실사용 상한 — macOS 104(NUL 포함)·Linux 108 중 작은 쪽. */
const UNIX_PATH_MAX_BYTES = 103;

const TCP_RE = /^tcp:\/\/(\[::1\]|[A-Za-z0-9.]+):(\d{1,5})$/;

/** 형식·loopback·포트 범위를 만족하면 구조값, 아니면 null(throw 없음 — zod refine·가드 공용). */
export function parseIpcAddress(s: string): IpcAddress | null {
  if (s.startsWith("unix:")) {
    const path = s.slice("unix:".length);
    const bytes = Buffer.byteLength(path, "utf8");
    return bytes > 0 && bytes <= UNIX_PATH_MAX_BYTES ? { kind: "unix", path } : null;
  }
  const m = TCP_RE.exec(s);
  if (m === null) return null;
  const host = m[1] === "[::1]" ? "::1" : m[1]!;
  const port = Number(m[2]);
  if (port < 1 || port > 65535 || !isLoopbackHost(host)) return null;
  return { kind: "tcp", host, port };
}

function isLoopbackHost(host: string): boolean {
  if (host === "localhost" || host === "::1") return true;
  const parts = host.split(".");
  if (parts.length !== 4 || parts[0] !== "127") return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}
