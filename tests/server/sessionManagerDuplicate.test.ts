// 중복 로그인 A단계 회귀 — 레지스트리 오염 방지.
// removeConnection이 playerId/accountId 키를 무조건 삭제하면, 선점 킥으로 밀려난 옛 세션의
// close가 "새 세션"의 엔트리를 지워 sendTo/withCork/autoSave에서 통째로 빠진 유령 세션이 된다.
// → 자기 자신이 현재 점유자일 때만 삭제해야 한다.

import { describe, expect, test } from "bun:test";
import { SessionManager } from "../../server/src/network/sessionManager";
import type { PlayerSession } from "../../server/src/network/session";

let connIdSeq = 1;

function fakeSession(
  opts: { playerId?: number | null; accountId?: number | null; closing?: boolean } = {},
): PlayerSession {
  return {
    connId: connIdSeq++,
    playerId: opts.playerId ?? null,
    accountId: opts.accountId ?? null,
    remoteAddress: undefined,
    socket: { closing: opts.closing ?? false },
  } as unknown as PlayerSession;
}

describe("SessionManager 중복 로그인 레지스트리", () => {
  test("authenticated는 현재 점유자일 때만 삭제 — 옛 세션 close가 새 세션을 못 지운다", () => {
    const sm = new SessionManager();
    const oldS = fakeSession({ playerId: 7 });
    const newS = fakeSession({ playerId: 7 });
    sm.addAuthenticated(oldS);
    sm.addAuthenticated(newS); // 선점 — 같은 키 덮어쓰기
    sm.removeConnection(oldS); // 옛 세션의 뒤늦은 close
    expect(sm.get(7)).toBe(newS);
    // withCork/autoSave 순회 대상에도 새 세션이 남아 있어야 한다(유령 세션 회귀).
    const values = [...sm.authenticatedValues()];
    expect(values).toContain(newS);
    expect(values).not.toContain(oldS);
  });

  test("점유자 본인의 close는 정상 삭제", () => {
    const sm = new SessionManager();
    const s = fakeSession({ playerId: 7 });
    sm.addAuthenticated(s);
    sm.removeConnection(s);
    expect(sm.get(7)).toBeUndefined();
  });

  test("claimAccount — 최초 클레임은 null, 재클레임은 밀려난 세션을 반환", () => {
    const sm = new SessionManager();
    const first = fakeSession({ accountId: 42 });
    const second = fakeSession({ accountId: 42 });
    expect(sm.claimAccount(42, first)).toBeNull();
    expect(sm.claimAccount(42, second)).toBe(first);
    expect(sm.accountSession(42)).toBe(second);
  });

  test("같은 세션의 재클레임은 null — self-kick 방지", () => {
    const sm = new SessionManager();
    const s = fakeSession({ accountId: 42 });
    expect(sm.claimAccount(42, s)).toBeNull();
    expect(sm.claimAccount(42, s)).toBeNull();
    expect(sm.accountSession(42)).toBe(s);
  });

  test("재-AUTH 계정 전환 — 이전 계정 클레임을 해제(영구 잔류 누수 방지)", () => {
    const sm = new SessionManager();
    const s = fakeSession();
    // authHandler 계약 미러: claimAccount 후 accountId 스탬프.
    sm.claimAccount(41, s);
    s.accountId = 41;
    sm.claimAccount(42, s);
    s.accountId = 42;
    // 41 클레임이 남아 있으면 이후 41 정상 로그인이 무관 세션(s)을 킥한다.
    expect(sm.accountSession(41)).toBeUndefined();
    expect(sm.accountSession(42)).toBe(s);
    sm.removeConnection(s);
    expect(sm.accountSession(42)).toBeUndefined();
  });

  test("releaseAuthenticated — 점유자일 때만 해제(preempt 즉시 정리 경로)", () => {
    const sm = new SessionManager();
    const oldS = fakeSession({ playerId: 7 });
    const newS = fakeSession({ playerId: 7 });
    sm.addAuthenticated(oldS);
    sm.releaseAuthenticated(oldS); // preempt가 밀려난 세션을 즉시 정리.
    expect(sm.get(7)).toBeUndefined();
    sm.addAuthenticated(newS);
    sm.releaseAuthenticated(oldS); // 이미 넘어간 키 — 새 점유자 불변.
    expect(sm.get(7)).toBe(newS);
  });

  test("계정 인덱스도 조건부 해제 — 옛 세션 close가 새 점유를 못 지운다", () => {
    const sm = new SessionManager();
    const oldS = fakeSession({ accountId: 42 });
    const newS = fakeSession({ accountId: 42 });
    sm.claimAccount(42, oldS);
    sm.claimAccount(42, newS);
    sm.removeConnection(oldS);
    expect(sm.accountSession(42)).toBe(newS);
    sm.removeConnection(newS);
    expect(sm.accountSession(42)).toBeUndefined();
  });

  // AUTH가 클레임 뒤에 실패하면(토큰 발급 실패) 클레임을 되돌린다 — 밀어낸 세션은 아직 킥하지 않았으므로 그 세션에 점유를 돌려준다.
  // 안 돌려주면 그 세션은 점유 없이 인월드에 남아 다음 로그인이 그 세션을 선점하지 못한다(계정 하나에 인월드 세션 둘).
  test("revertAccountClaim — 밀어낸 세션이 살아 있으면 그 세션에 점유 복원", () => {
    const sm = new SessionManager();
    const live = fakeSession({ accountId: 42 });
    const failed = fakeSession();
    sm.claimAccount(42, live);
    const prev = sm.claimAccount(42, failed);
    failed.accountId = 42;
    sm.revertAccountClaim(42, failed, prev);
    expect(sm.accountSession(42)).toBe(live);
    sm.removeConnection(failed); // 실패 세션의 뒤늦은 close는 복원된 점유를 지우지 않는다.
    expect(sm.accountSession(42)).toBe(live);
  });

  test("revertAccountClaim — 밀어낸 세션이 없거나 이미 닫히는 중이면 점유 해제", () => {
    const sm = new SessionManager();
    const alone = fakeSession();
    sm.revertAccountClaim(42, alone, sm.claimAccount(42, alone));
    expect(sm.accountSession(42)).toBeUndefined();

    const dying = fakeSession({ accountId: 43, closing: true });
    const failed = fakeSession();
    sm.claimAccount(43, dying);
    sm.revertAccountClaim(43, failed, sm.claimAccount(43, failed));
    expect(sm.accountSession(43)).toBeUndefined(); // 닫히는 세션으로 되돌리면 byAccount에 죽은 엔트리가 남는다.
  });

  test("revertAccountClaim — 그 사이 다른 세션이 계정을 가져갔으면 아무것도 안 한다", () => {
    const sm = new SessionManager();
    const failed = fakeSession();
    const prev = sm.claimAccount(42, failed);
    const winner = fakeSession();
    sm.claimAccount(42, winner);
    sm.revertAccountClaim(42, failed, prev);
    expect(sm.accountSession(42)).toBe(winner);
  });

  test("playerId/accountId가 null인 세션의 remove는 무해", () => {
    const sm = new SessionManager();
    const inWorld = fakeSession({ playerId: 7, accountId: 42 });
    sm.addAuthenticated(inWorld);
    sm.claimAccount(42, inWorld);
    sm.removeConnection(fakeSession()); // 미인증 연결의 close
    expect(sm.get(7)).toBe(inWorld);
    expect(sm.accountSession(42)).toBe(inWorld);
  });
});
