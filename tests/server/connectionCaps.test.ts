// HIGH 회귀 — 연결 상한(전역/IP별, loopback 예외).
// 상한 없으면 단일 IP 대량 연결로 소켓·세션 고갈(DoS). loopback은 로컬 통합
// 테스트/loadgen이 다중 연결하므로 per-IP 상한에서 제외.

import { describe, expect, test } from "bun:test";
import {
  SessionManager,
  MAX_CONNECTIONS,
  MAX_CONNECTIONS_PER_IP,
  defaultPreAuthCap,
} from "../../server/src/network/sessionManager";
import { PlayerSession, setSessionState } from "../../server/src/network/session";
import { perIpKey } from "../../server/src/net/ipBucket";

function fakeSession(ip: string | undefined): PlayerSession {
  return { playerId: null, remoteAddress: ip } as unknown as PlayerSession;
}

/** 실물 PlayerSession — setSessionState가 pre-auth 회계(leavePreAuth)를 통지한다. */
function realSession(ip: string): PlayerSession {
  const raw = { write: (b: Buffer) => b.length, end() {}, remoteAddress: ip };
  return new PlayerSession(raw as unknown as Bun.Socket<PlayerSession>);
}

/** IP 총량 상한만 보는 테스트용 — IP별 미인증 몫(기본 per-IP의 25%)이 먼저 걸리지 않게 같게 둔다. */
const PER_IP_ONLY = { maxPreAuthPerIp: MAX_CONNECTIONS_PER_IP };

describe("SessionManager 연결 상한", () => {
  test("동일 IP는 MAX_CONNECTIONS_PER_IP까지, 초과는 per_ip_cap", () => {
    const sm = new SessionManager(PER_IP_ONLY);
    for (let i = 0; i < MAX_CONNECTIONS_PER_IP; i++) {
      expect(sm.addConnection(fakeSession("10.0.0.9"))).toBe("ok");
    }
    expect(sm.addConnection(fakeSession("10.0.0.9"))).toBe("per_ip_cap");
    // 다른 IP는 여전히 수용.
    expect(sm.addConnection(fakeSession("10.0.0.10"))).toBe("ok");
  });

  test("loopback은 per-IP 상한 예외", () => {
    const sm = new SessionManager();
    for (let i = 0; i < MAX_CONNECTIONS_PER_IP + 8; i++) {
      expect(sm.addConnection(fakeSession("127.0.0.1"))).toBe("ok");
    }
  });

  test("removeConnection이 per-IP 슬롯을 반환한다", () => {
    const sm = new SessionManager(PER_IP_ONLY);
    const sessions: PlayerSession[] = [];
    for (let i = 0; i < MAX_CONNECTIONS_PER_IP; i++) {
      const s = fakeSession("10.0.0.9");
      sessions.push(s);
      sm.addConnection(s);
    }
    expect(sm.addConnection(fakeSession("10.0.0.9"))).toBe("per_ip_cap");
    expect(sm.removeConnection(sessions[0]!)).toBe(true);
    expect(sm.addConnection(fakeSession("10.0.0.9"))).toBe("ok");
  });

  test("전역 상한 초과는 global_cap, 거절된 세션의 remove는 false(이중 감소 방지)", () => {
    // pre-auth 서브캡(기본 25%)이 먼저 걸리지 않게 전역 상한과 같게 둔다.
    const sm = new SessionManager({ maxPreAuthConnections: MAX_CONNECTIONS });
    for (let i = 0; i < MAX_CONNECTIONS; i++) {
      // IP를 분산시켜 per-IP 상한에 걸리지 않게.
      expect(sm.addConnection(fakeSession(`10.${i % 250}.${Math.floor(i / 250)}.1`))).toBe("ok");
    }
    const rejected = fakeSession("10.99.99.99");
    expect(sm.addConnection(rejected)).toBe("global_cap");
    // 거절된 연결의 close 경로 — 추적된 적 없으므로 false.
    expect(sm.removeConnection(rejected)).toBe(false);
  });

  test("생성자 caps 주입 — 전역/IP별 상한을 env 값으로 대체", () => {
    const sm = new SessionManager({
      maxConnections: 3,
      maxConnectionsPerIp: 2,
      maxPreAuthConnections: 3,
      maxPreAuthPerIp: 2,
    });
    expect(sm.addConnection(fakeSession("10.0.0.1"))).toBe("ok");
    expect(sm.addConnection(fakeSession("10.0.0.1"))).toBe("ok");
    expect(sm.addConnection(fakeSession("10.0.0.1"))).toBe("per_ip_cap");
    expect(sm.addConnection(fakeSession("10.0.0.2"))).toBe("ok");
    expect(sm.addConnection(fakeSession("10.0.0.3"))).toBe("global_cap");
    expect(sm.connectionCount()).toBe(3);
  });

  test("setCaps — 부분 갱신(미지정 키는 유지), 기존 연결은 끊지 않음", () => {
    const sm = new SessionManager({ maxConnections: 2, maxConnectionsPerIp: 1, maxPreAuthConnections: 10 });
    sm.addConnection(fakeSession("10.0.0.1"));
    sm.addConnection(fakeSession("10.0.0.2"));
    sm.setCaps({ maxConnections: 1 });
    expect(sm.connectionCount()).toBe(2);
    expect(sm.addConnection(fakeSession("10.0.0.3"))).toBe("global_cap");
    sm.setCaps({ maxConnections: 10 });
    // per-IP 상한 1은 유지.
    expect(sm.addConnection(fakeSession("10.0.0.1"))).toBe("per_ip_cap");
  });
});

describe("perIpKey — per-IP 회계 키(SEC: IPv6 /64 버킷)", () => {
  test.each([
    ["203.0.113.7", "203.0.113.7"],
    ["::ffff:203.0.113.7", "203.0.113.7"],
    ["::FFFF:cb00:7107", "203.0.113.7"],
    ["2001:db8:1:2:aaaa:bbbb:cccc:dddd", "2001:db8:1:2::/64"],
    ["2001:0db8:0001:0002::1", "2001:db8:1:2::/64"],
    ["2001:db8::1", "2001:db8:0:0::/64"],
    ["fe80::1%eth0", "fe80:0:0:0::/64"],
    // NAT64 well-known 프리픽스(64:ff9b::/96, RFC 6052) — 하위 32비트가 IPv4 클라 주소.
    ["64:ff9b::203.0.113.7", "203.0.113.7"],
    ["64:FF9B::cb00:7107", "203.0.113.7"],
    // WKP는 비전역 IPv4를 담지 않는다(RFC 6052 §3.1) — loopback 예외를 상속하지 않는다.
    ["64:ff9b::127.0.0.1", "127.0.0.1"],
    // 같은 /64라도 /96 밖(하위 비트가 다른 NAT64 아님)은 /64 버킷 그대로.
    ["64:ff9b:0:0:1::1", "64:ff9b:0:0::/64"],
    ["not-an-ip:zz", "not-an-ip:zz"],
  ])("%s → %s", (addr, key) => {
    expect(perIpKey(addr)).toBe(key);
  });

  test.each(["127.0.0.1", "127.8.9.10", "::1", "::ffff:127.0.0.1", "0:0:0:0:0:0:0:1"])(
    "loopback %s → null(상한 예외)",
    (addr) => {
      expect(perIpKey(addr)).toBeNull();
    },
  );

  test("주소 없음 → null", () => {
    expect(perIpKey(undefined)).toBeNull();
    expect(perIpKey("")).toBeNull();
  });
});

describe("SessionManager — IPv6 /64 버킷 상한", () => {
  test("같은 /64의 서로 다른 주소는 한 버킷으로 per-IP 상한을 공유", () => {
    const sm = new SessionManager({
      maxConnectionsPerIp: 2,
      maxPreAuthConnections: 100,
      maxPreAuthPerIp: 2,
    });
    expect(sm.addConnection(fakeSession("2001:db8:1:2::a"))).toBe("ok");
    expect(sm.addConnection(fakeSession("2001:db8:1:2::b"))).toBe("ok");
    expect(sm.addConnection(fakeSession("2001:db8:1:2:ffff::c"))).toBe("per_ip_cap");
    // 다른 /64는 별도 버킷.
    expect(sm.addConnection(fakeSession("2001:db8:1:3::a"))).toBe("ok");
  });

  test("IPv4-mapped 표기와 IPv4 표기는 같은 버킷, remove는 같은 키로 대칭 감소", () => {
    const sm = new SessionManager({ maxConnectionsPerIp: 1, maxPreAuthConnections: 100 });
    const mapped = fakeSession("::ffff:198.51.100.4");
    expect(sm.addConnection(mapped)).toBe("ok");
    expect(sm.addConnection(fakeSession("198.51.100.4"))).toBe("per_ip_cap");
    expect(sm.removeConnection(mapped)).toBe(true);
    expect(sm.addConnection(fakeSession("198.51.100.4"))).toBe("ok");
  });
});

describe("SessionManager — pre-auth 서브캡(SEC: 미인증 슬롯 선점)", () => {
  test("미지정 시 기본 = maxConnections의 25%(올림), maxConnections 변경을 따라간다", () => {
    expect(defaultPreAuthCap(2000)).toBe(500);
    expect(defaultPreAuthCap(1)).toBe(1);
    expect(defaultPreAuthCap(10)).toBe(3);
    const sm = new SessionManager({ maxConnections: 8 });
    expect(sm.preAuthCap()).toBe(2);
    sm.setCaps({ maxConnections: 40 });
    expect(sm.preAuthCap()).toBe(10);
    sm.setCaps({ maxPreAuthConnections: 7 });
    expect(sm.preAuthCap()).toBe(7);
    sm.setCaps({ maxPreAuthConnections: null });
    expect(sm.preAuthCap()).toBe(10);
  });

  test("미인증 연결이 서브캡에 차면 pre_auth_cap, 전역 슬롯은 남아 있어도 거절", () => {
    const sm = new SessionManager({ maxConnections: 100, maxPreAuthConnections: 2 });
    expect(sm.addConnection(realSession("10.1.0.1"))).toBe("ok");
    expect(sm.addConnection(realSession("10.1.0.2"))).toBe("ok");
    expect(sm.addConnection(realSession("10.1.0.3"))).toBe("pre_auth_cap");
    expect(sm.preAuthCount()).toBe(2);
    expect(sm.connectionCount()).toBe(2);
  });

  test("AUTHENTICATED 전이(setSessionState 단일 진입점)가 pre-auth 슬롯을 즉시 반환", () => {
    const sm = new SessionManager({ maxConnections: 100, maxPreAuthConnections: 1 });
    const a = realSession("10.1.0.1");
    expect(sm.addConnection(a)).toBe("ok");
    expect(sm.addConnection(realSession("10.1.0.2"))).toBe("pre_auth_cap");
    setSessionState(a, "HELLO_RECV");
    expect(sm.preAuthCount()).toBe(1);
    setSessionState(a, "AUTHENTICATED");
    expect(a.preAuth).toBe(false);
    expect(sm.preAuthCount()).toBe(0);
    expect(sm.addConnection(realSession("10.1.0.2"))).toBe("ok");
    // 인증 이후의 상태 변화(IN_WORLD/REJECT)는 회계에 영향 없음 — 이중 감소 없음.
    setSessionState(a, "IN_WORLD");
    setSessionState(a, "REJECT");
    expect(sm.preAuthCount()).toBe(1);
  });

  test("close(removeConnection)가 미인증 슬롯을 정확히 1회 반환, 인증 세션 close는 무영향", () => {
    const sm = new SessionManager({ maxConnections: 100, maxPreAuthConnections: 5 });
    const pre = realSession("10.1.0.1");
    const authed = realSession("10.1.0.2");
    sm.addConnection(pre);
    sm.addConnection(authed);
    setSessionState(authed, "HELLO_RECV");
    setSessionState(authed, "AUTHENTICATED");
    expect(sm.preAuthCount()).toBe(1);
    sm.removeConnection(authed);
    expect(sm.preAuthCount()).toBe(1);
    sm.removeConnection(pre);
    sm.removeConnection(pre);
    expect(sm.preAuthCount()).toBe(0);
    // close 이후 늦게 끝난 인증(async 핸들러)도 회계를 건드리지 않는다.
    setSessionState(pre, "HELLO_RECV");
    setSessionState(pre, "AUTHENTICATED");
    expect(sm.preAuthCount()).toBe(0);
  });

  test("auth 실패(REJECT)로 끝난 미인증 세션은 close까지 서브캡을 점유", () => {
    const sm = new SessionManager({ maxConnections: 100, maxPreAuthConnections: 1 });
    const a = realSession("10.1.0.1");
    sm.addConnection(a);
    setSessionState(a, "HELLO_RECV");
    setSessionState(a, "REJECT");
    expect(a.preAuth).toBe(true);
    expect(sm.addConnection(realSession("10.1.0.2"))).toBe("pre_auth_cap");
    sm.removeConnection(a);
    expect(sm.addConnection(realSession("10.1.0.2"))).toBe("ok");
  });
});

describe("SessionManager — IP별 미인증 몫", () => {

  test("미지정 시 기본 = maxConnectionsPerIp의 25%(올림) — 기본 32 → 8, per-IP 상한 변경을 따라간다", () => {
    const sm = new SessionManager();
    expect(sm.preAuthPerIpCap()).toBe(8);
    sm.setCaps({ maxConnectionsPerIp: 100 });
    expect(sm.preAuthPerIpCap()).toBe(25);
    sm.setCaps({ maxPreAuthPerIp: 3 });
    expect(sm.preAuthPerIpCap()).toBe(3);
    sm.setCaps({ maxPreAuthPerIp: null });
    expect(sm.preAuthPerIpCap()).toBe(25);
  });

  test("기본 상한에서 16 IP × 32 미인증으로는 서브캡(500)을 채울 수 없다 — 정상 접속은 수용", () => {
    const sm = new SessionManager();
    const tally = new Map<string, number>();
    for (let ip = 1; ip <= 16; ip++) {
      for (let k = 0; k < MAX_CONNECTIONS_PER_IP; k++) {
        const v = sm.addConnection(realSession(`198.18.0.${ip}`));
        tally.set(v, (tally.get(v) ?? 0) + 1);
      }
    }
    expect(tally.get("ok")).toBe(16 * 8);
    expect(tally.get("pre_auth_per_ip_cap")).toBe(16 * (MAX_CONNECTIONS_PER_IP - 8));
    expect(sm.preAuthCount()).toBe(128);
    expect(sm.addConnection(realSession("203.0.113.50"))).toBe("ok");
    expect(Math.ceil(sm.preAuthCap() / sm.preAuthPerIpCap())).toBe(
      Math.ceil(MAX_CONNECTIONS / MAX_CONNECTIONS_PER_IP),
    );
  });

  test("인증 완료가 IP별 미인증 몫을 반환 — 인증 세션은 IP 총량 상한에만 계산", () => {
    const sm = new SessionManager({ maxConnectionsPerIp: 4, maxPreAuthPerIp: 2 });
    const a = realSession("10.2.0.1");
    expect(sm.addConnection(a)).toBe("ok");
    expect(sm.addConnection(realSession("10.2.0.1"))).toBe("ok");
    expect(sm.addConnection(realSession("10.2.0.1"))).toBe("pre_auth_per_ip_cap");
    // 다른 IP의 몫은 별개.
    expect(sm.addConnection(realSession("10.2.0.2"))).toBe("ok");
    setSessionState(a, "HELLO_RECV");
    setSessionState(a, "AUTHENTICATED");
    expect(sm.addConnection(realSession("10.2.0.1"))).toBe("ok");
    expect(sm.addConnection(realSession("10.2.0.1"))).toBe("pre_auth_per_ip_cap");
    // 인증 세션 1 + 미인증 2 = 3, 총량 상한 4는 미인증 몫과 독립.
    setSessionState(a, "IN_WORLD");
    expect(sm.addConnection(realSession("10.2.0.1"))).toBe("pre_auth_per_ip_cap");
  });

  test("IP 총량 상한이 먼저 — 총량이 찬 IP는 미인증 몫이 남아 있어도 per_ip_cap", () => {
    const sm = new SessionManager({ maxConnectionsPerIp: 2, maxPreAuthPerIp: 2 });
    const a = realSession("10.4.0.1");
    sm.addConnection(a);
    setSessionState(a, "HELLO_RECV");
    setSessionState(a, "AUTHENTICATED");
    expect(sm.addConnection(realSession("10.4.0.1"))).toBe("ok");
    expect(sm.addConnection(realSession("10.4.0.1"))).toBe("per_ip_cap");
  });

  test("close가 IP별 미인증 몫을 정확히 1회 반환 — 거절 연결 close·close 후 늦은 인증은 무영향", () => {
    const sm = new SessionManager({ maxPreAuthPerIp: 1 });
    const a = realSession("10.3.0.1");
    expect(sm.addConnection(a)).toBe("ok");
    const rejected = realSession("10.3.0.1");
    expect(sm.addConnection(rejected)).toBe("pre_auth_per_ip_cap");
    expect(sm.removeConnection(rejected)).toBe(false);
    expect(sm.addConnection(realSession("10.3.0.1"))).toBe("pre_auth_per_ip_cap");
    expect(sm.removeConnection(a)).toBe(true);
    sm.removeConnection(a);
    const b = realSession("10.3.0.1");
    expect(sm.addConnection(b)).toBe("ok");
    setSessionState(a, "HELLO_RECV");
    setSessionState(a, "AUTHENTICATED");
    expect(sm.addConnection(realSession("10.3.0.1"))).toBe("pre_auth_per_ip_cap");
  });

  test("loopback은 IP별 미인증 몫에서도 예외(로컬 통합 테스트·loadgen)", () => {
    const sm = new SessionManager({ maxPreAuthPerIp: 1 });
    for (let i = 0; i < 5; i++) expect(sm.addConnection(realSession("127.0.0.1"))).toBe("ok");
  });
});
