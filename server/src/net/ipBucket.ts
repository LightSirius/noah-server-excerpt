// IP별 연결 상한의 회계 키 — sessionManager.addConnection/removeConnection 공용(같은 함수 =
// 증감 대칭).
//
// 주소 문자열 완전일치를 키로 쓰면 IPv6 사용자는 /64 하나(ISP 기본 할당 단위)로 2^64개 주소를
// 돌려 써서 per-IP 상한을 무력화한다. 그래서:
//   - IPv4: 주소 그대로(종전 동일).
//   - IPv4-mapped IPv6(`::ffff:a.b.c.d`): IPv4로 환원 — 듀얼스택 리스너에서 같은 클라가 두
//     표기로 보여도 한 버킷.
//   - NAT64 well-known 프리픽스(`64:ff9b::/96`, RFC 6052): 하위 32비트의 IPv4로 환원 — 변환기
//     뒤 IPv4 클라 전원이 /64 하나(=32명)로 묶여 오거부되지 않게. WKP는 비전역 IPv4를 담지
//     않으므로(§3.1) loopback 예외는 상속하지 않는다.
//   - IPv6: 앞 64비트 프리픽스(`2001:db8:0:1::/64`).
//   - loopback(127.0.0.0/8, ::1): null = 미추적(로컬 통합 테스트·loadgen 다중 연결 예외).
// 파싱 불가 문자열은 소문자 원문을 키로 둔다(회계는 유지, 버킷팅만 포기).
// 현행 리스너는 `0.0.0.0`(IPv4 전용)이라 IPv6 분기는 듀얼스택 바인딩·4단계 게이트웨이 대비다.

/** 반환 null = per-IP 상한 미적용(loopback·주소 없음). */
export function perIpKey(addr: string | undefined): string | null {
  if (addr === undefined || addr === "") return null;
  const zoneAt = addr.indexOf("%");
  const bare = (zoneAt === -1 ? addr : addr.slice(0, zoneAt)).toLowerCase();
  if (!bare.includes(":")) return ipv4Key(bare);
  const g = parseIpv6(bare);
  if (g === null) return bare;
  if (isV4Mapped(g)) return ipv4Key(embeddedV4(g));
  if (isNat64WellKnown(g)) return embeddedV4(g);
  if (isLoopback6(g)) return null;
  return `${g
    .slice(0, 4)
    .map((x) => x.toString(16))
    .join(":")}::/64`;
}

function ipv4Key(a: string): string | null {
  return a.startsWith("127.") ? null : a;
}

/** 하위 32비트(hextet 6·7)를 점 표기 IPv4로. */
function embeddedV4(g: readonly number[]): string {
  return `${g[6]! >> 8}.${g[6]! & 0xff}.${g[7]! >> 8}.${g[7]! & 0xff}`;
}

function isV4Mapped(g: readonly number[]): boolean {
  return g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff;
}

/** `64:ff9b::/96` — RFC 6052 well-known 프리픽스. */
function isNat64WellKnown(g: readonly number[]): boolean {
  return g[0] === 0x64 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0;
}

function isLoopback6(g: readonly number[]): boolean {
  for (let i = 0; i < 7; i++) if (g[i] !== 0) return false;
  return g[7] === 1;
}

function parseIpv4(s: string): number[] | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/** hextet 목록 파싱 — IPv4 점 표기는 마지막 그룹에서만 허용(2 hextet으로 전개). */
function parseGroups(parts: readonly string[]): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (p.includes(".")) {
      if (i !== parts.length - 1) return null;
      const v4 = parseIpv4(p);
      if (v4 === null) return null;
      out.push((v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!);
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/.test(p)) return null;
    out.push(Number.parseInt(p, 16));
  }
  return out;
}

/** 소문자 IPv6 텍스트 → 8 hextet. `::` 압축은 최대 1회. 형식 위반은 null. */
function parseIpv6(s: string): number[] | null {
  const dbl = s.indexOf("::");
  if (dbl !== s.lastIndexOf("::")) return null;
  if (dbl === -1) {
    const all = parseGroups(s.split(":"));
    return all !== null && all.length === 8 ? all : null;
  }
  const headStr = s.slice(0, dbl);
  const tailStr = s.slice(dbl + 2);
  if (headStr.includes(".")) return null;
  const head = parseGroups(headStr === "" ? [] : headStr.split(":"));
  const tail = parseGroups(tailStr === "" ? [] : tailStr.split(":"));
  if (head === null || tail === null) return null;
  const fill = 8 - head.length - tail.length;
  if (fill < 1) return null;
  return [...head, ...new Array<number>(fill).fill(0), ...tail];
}
